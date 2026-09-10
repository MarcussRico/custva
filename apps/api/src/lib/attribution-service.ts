import type { PoolClient } from "pg";
import {
  ATTRIBUTION,
  decideAttribution,
  pickLastTouch,
  type AttributionDecision,
  type EligibleMessage,
  type Segment,
} from "@custva/shared";

/**
 * Database-facing half of attribution. The decision rules are pure and live in
 * `@custva/shared`; this module only gathers inputs and persists the outcome.
 */

type Queryable = Pick<PoolClient, "query">;

/**
 * FR-A1..A7. Tags one visit organic or influenced and stores enough to
 * reconstruct the decision later (NFR-2).
 *
 * `segmentAtVisit` MUST be read before the visit updates the customer rollup.
 * Recording a visit makes someone look more loyal, so a segment read afterwards
 * would trip the FR-A5 shield on essentially every return and nothing would
 * ever be attributed. The caller captures it at the top of the transaction.
 */
export async function attributeVisit(
  client: Queryable,
  input: {
    merchantId: string;
    customerId: string;
    visitId: string;
    visitAt: Date;
    isFirstVisit: boolean;
    segmentAtVisit: Segment | null;
    /** Needed for FR-M1 rollups and the FR-M4 commission row. */
    billingAmount: number;
    windowDays?: number;
  },
): Promise<AttributionDecision> {
  const windowDays = input.windowDays ?? ATTRIBUTION.windowDays;

  /* FR-A2/A3 — candidates are messages that actually reached the customer and
     engaged inside the window. Both campaign and lifecycle sends live in
     `messages` (TR-3), so this covers both paths with one query.

     A handful is fetched rather than one, so that `pickLastTouch` — the shared
     FR-A4 rule — makes the choice instead of an ORDER BY that could drift from
     it. */
  const candidates = await client.query<{
    id: string;
    engaged_at: Date;
    was_read: boolean;
  }>(
    `SELECT id,
            COALESCE(opened_at, delivered_at) AS engaged_at,
            (opened_at IS NOT NULL)           AS was_read
       FROM messages
      WHERE customer_id = $1
        AND merchant_id = $2
        AND COALESCE(opened_at, delivered_at) IS NOT NULL
        AND COALESCE(opened_at, delivered_at) <= $3
        AND COALESCE(opened_at, delivered_at) >= $3 - ($4 * INTERVAL '1 day')
      ORDER BY COALESCE(opened_at, delivered_at) DESC
      LIMIT 20`,
    [input.customerId, input.merchantId, input.visitAt, windowDays],
  );

  const eligible: EligibleMessage[] = candidates.rows.map((r) => ({
    id: r.id,
    engagedAt: r.engaged_at,
    wasRead: r.was_read,
  }));

  const decision = decideAttribution({
    isFirstVisit: input.isFirstVisit,
    segmentAtVisit: input.segmentAtVisit,
    eligibleMessage: pickLastTouch(eligible),
    windowDays,
  });

  await client.query(
    `UPDATE customer_visits
        SET return_type = $1,
            attributed_message_id = $2,
            attribution_window_days = $3,
            segment_at_visit = $4,
            attributed_at = NOW()
      WHERE id = $5 AND merchant_id = $6`,
    [
      decision.returnType,
      decision.attributedMessageId,
      decision.windowDays,
      input.segmentAtVisit,
      input.visitId,
      input.merchantId,
    ],
  );

  await recordRevenueSplitAndCommission(client, {
    merchantId: input.merchantId,
    customerId: input.customerId,
    visitId: input.visitId,
    billingAmount: input.billingAmount,
    isFirstVisit: input.isFirstVisit,
    decision,
  });

  return decision;
}

/**
 * FR-M1 and FR-M4, together because they are the same fact recorded twice: a
 * daily rollup for the dashboard, and an immutable row for billing.
 *
 * A first visit contributes to revenue but is neither organic *repeat* revenue
 * nor influenced — there was no return to cause.
 */
async function recordRevenueSplitAndCommission(
  client: Queryable,
  input: {
    merchantId: string;
    customerId: string;
    visitId: string;
    billingAmount: number;
    isFirstVisit: boolean;
    decision: AttributionDecision;
  },
): Promise<void> {
  const influenced = input.decision.returnType === "custva_influenced";
  const organicRepeat = !input.isFirstVisit && !influenced;

  await client.query(
    `INSERT INTO daily_merchant_metrics (
       merchant_id, metric_date, organic_repeat_revenue, influenced_revenue, influenced_visits
     )
     VALUES ($1, CURRENT_DATE, $2, $3, $4)
     ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
       organic_repeat_revenue =
         daily_merchant_metrics.organic_repeat_revenue + EXCLUDED.organic_repeat_revenue,
       influenced_revenue =
         daily_merchant_metrics.influenced_revenue + EXCLUDED.influenced_revenue,
       influenced_visits =
         daily_merchant_metrics.influenced_visits + EXCLUDED.influenced_visits,
       updated_at = NOW()`,
    [
      input.merchantId,
      organicRepeat ? input.billingAmount : 0,
      influenced ? input.billingAmount : 0,
      influenced ? 1 : 0,
    ],
  );

  /* FR-M5 — organic visits never create a commission row. Not a zero row: no
     row, so the ledger contains only what is genuinely billable. */
  if (!influenced) return;

  const merchant = await client.query<{ commission_rate: string }>(
    `SELECT commission_rate FROM merchants WHERE id = $1`,
    [input.merchantId],
  );
  const rate = Number(merchant.rows[0]?.commission_rate ?? 0);
  const amount = Number((input.billingAmount * rate).toFixed(2));

  /* The rate is copied in, not joined at read time. NFR-4: changing a
     merchant's rate tomorrow must not silently restate every invoice already
     issued. ON CONFLICT DO NOTHING makes a retried transaction safe — a visit
     can never bill twice. */
  await client.query(
    `INSERT INTO commission_events (
       merchant_id, visit_id, customer_id, attributed_message_id,
       influenced_amount, commission_rate, commission_amount
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (visit_id) DO NOTHING`,
    [
      input.merchantId,
      input.visitId,
      input.customerId,
      input.decision.attributedMessageId,
      input.billingAmount,
      rate,
      amount,
    ],
  );
}

/**
 * FR-A7 / BR-5 — reconstruct one visit's attribution for audit or for the
 * "why was I charged for this?" conversation. Everything returned comes from
 * stored columns; nothing is recomputed, so the answer cannot drift from the
 * decision that was actually billed (NFR-4).
 */
export async function explainVisitAttribution(
  client: Queryable,
  merchantId: string,
  visitId: string,
) {
  const result = await client.query(
    `SELECT v.id                       AS "visitId",
            v.visit_at                 AS "visitAt",
            v.billing_amount           AS "billingAmount",
            v.return_type              AS "returnType",
            v.segment_at_visit         AS "segmentAtVisit",
            v.attribution_window_days  AS "windowDays",
            v.attributed_at            AS "attributedAt",
            m.id                       AS "messageId",
            m.campaign_id              AS "campaignId",
            m.lifecycle_schedule_id    AS "lifecycleScheduleId",
            m.delivered_at             AS "deliveredAt",
            m.opened_at                AS "openedAt"
       FROM customer_visits v
       LEFT JOIN messages m ON m.id = v.attributed_message_id
      WHERE v.id = $1 AND v.merchant_id = $2`,
    [visitId, merchantId],
  );
  return result.rows[0] ?? null;
}
