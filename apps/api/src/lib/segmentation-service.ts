import type { PoolClient } from "pg";
import { query } from "./db.js";
import { computeSegmentation, type SegmentComputation } from "@custva/shared";

/**
 * Database-facing half of segmentation. The rules themselves live in
 * `segmentation.ts` and are pure; this module only loads inputs and persists
 * outputs, so the thresholds exist in exactly one place (FR-S4, TR-1).
 */

type Queryable = Pick<PoolClient, "query">;

/**
 * FR-S4 — refresh on visit write. Runs inside the caller's transaction so a
 * customer's rollup and their segment can never disagree.
 *
 * Reads the cached merchant median rather than computing it (see migration
 * 0015): this sits in the POS path and NFR-3 caps acceptable latency there.
 */
export async function recomputeSegmentForCustomer(
  client: Queryable,
  merchantId: string,
  customerId: string,
  now: Date = new Date(),
): Promise<SegmentComputation | null> {
  const customer = await client.query<{
    total_visits: number;
    last_visit: Date | null;
    median_gap_days: string | null;
  }>(
    `SELECT c.total_visits, c.last_visit, m.median_gap_days
       FROM customers c
       JOIN merchants m ON m.id = c.merchant_id
      WHERE c.id = $1 AND c.merchant_id = $2`,
    [customerId, merchantId],
  );
  if (!customer.rowCount) return null;
  const row = customer.rows[0];

  /* Bounded deliberately. The median of a customer's recent rhythm is what
     matters; someone with 400 visits does not need all 400 read on every
     write, and their rhythm two years ago is not evidence about today. */
  const visits = await client.query<{ visit_at: Date }>(
    `SELECT visit_at FROM customer_visits
      WHERE customer_id = $1 ORDER BY visit_at DESC LIMIT 30`,
    [customerId],
  );

  const computed = computeSegmentation({
    visitDates: visits.rows.map((v) => v.visit_at),
    totalVisits: Number(row.total_visits),
    lastVisit: row.last_visit,
    merchantMedianGapDays:
      row.median_gap_days == null ? null : Number(row.median_gap_days),
    now,
  });

  await client.query(
    `UPDATE customers
        SET segment = $1,
            expected_gap_days = $2,
            expected_revisit_at = $3,
            segment_updated_at = NOW(),
            updated_at = NOW()
      WHERE id = $4 AND merchant_id = $5`,
    [
      computed.segment,
      computed.expectedGapDays,
      computed.expectedRevisitAt,
      customerId,
      merchantId,
    ],
  );

  return computed;
}

/**
 * Refresh the cached merchant median (FR-S2 fallback). Called by the sweep,
 * not by the visit path.
 */
export async function refreshMerchantMedianGap(
  merchantId: string,
): Promise<number | null> {
  const result = await query<{ median_gap: string | null }>(
    `WITH gaps AS (
       SELECT EXTRACT(EPOCH FROM (
                visit_at - LAG(visit_at) OVER (PARTITION BY customer_id ORDER BY visit_at)
              )) / 86400.0 AS gap
         FROM customer_visits
        WHERE merchant_id = $1
     )
     SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY gap) AS median_gap
       FROM gaps
      WHERE gap IS NOT NULL AND gap > 0`,
    [merchantId],
  );

  const median = result.rows[0]?.median_gap;
  const value = median == null ? null : Number(median);

  await query(
    `UPDATE merchants
        SET median_gap_days = $1, median_gap_updated_at = NOW(), updated_at = NOW()
      WHERE id = $2`,
    [value, merchantId],
  );

  return value;
}

/**
 * FR-S4 — the half that matters most and is easiest to forget.
 *
 * At-Risk and Dormant are states a customer enters by doing *nothing*. Without
 * a sweep that reclassifies people with no new visit, nobody ever becomes
 * At-Risk, and the entire intervention model is inert. This is the job that
 * makes the product work.
 *
 * Returns per-segment counts so the caller can log what moved.
 */
export async function sweepMerchantSegments(
  merchantId: string,
  now: Date = new Date(),
): Promise<Record<string, number>> {
  await refreshMerchantMedianGap(merchantId);

  const customers = await query<{ id: string }>(
    /* Only customers whose classification could have changed: anyone whose
       expected revisit has passed, or who has never been classified. */
    `SELECT id FROM customers
      WHERE merchant_id = $1
        AND (segment IS NULL OR expected_revisit_at IS NULL OR expected_revisit_at <= $2)`,
    [merchantId, now],
  );

  const counts: Record<string, number> = {};
  for (const { id } of customers.rows) {
    const computed = await recomputeSegmentForCustomer(
      { query: query as unknown as PoolClient["query"] },
      merchantId,
      id,
      now,
    );
    if (computed) {
      counts[computed.segment] = (counts[computed.segment] ?? 0) + 1;
    }
  }
  return counts;
}
