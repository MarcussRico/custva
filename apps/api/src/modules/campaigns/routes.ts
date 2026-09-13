import { campaignBatchBullJobId } from "@custva/shared";
import { Router } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { query } from "../../lib/db.js";
import { assignHoldout, computeLift } from "@custva/shared";
import { getCampaignDispatchQueue } from "../../lib/queue.js";
import {
  audienceRulesSchema,
  buildAudienceQuery,
  type AudienceRules
} from "../../lib/audience-engine.js";

const campaignSchema = z.object({
  campaignName: z.string().min(3),
  templateId: z.string().uuid(),
  audienceRules: audienceRulesSchema.default({}),
  manualIncludeIds: z.array(z.string().uuid()).default([]),
  manualExcludeIds: z.array(z.string().uuid()).default([]),
  scheduledAt: z.string().datetime().optional()
});

const BATCH_SIZE = 100;

/* The audience query scopes every branch to the merchant, so a foreign id can no
   longer leak a customer. This is the second line: reject the request outright
   rather than silently returning fewer people than the caller listed, and keep
   foreign ids from being persisted onto the campaign row in the first place. */
async function assertCustomersBelongToMerchant(
  merchantId: string,
  ids: string[]
): Promise<string[]> {
  if (!ids.length) return [];
  const found = await query<{ id: string }>(
    `SELECT id FROM customers WHERE merchant_id = $1 AND id = ANY($2::uuid[])`,
    [merchantId, ids]
  );
  const owned = new Set(found.rows.map((r) => r.id));
  return ids.filter((id) => !owned.has(id));
}

async function resolveAudience(
  merchantId: string,
  rules: AudienceRules,
  manualIncludeIds: string[],
  manualExcludeIds: string[]
) {
  const { sql, params } = buildAudienceQuery(merchantId, rules, manualIncludeIds, manualExcludeIds);
  const result = await query<{
    id: string;
    mobile: string;
    name: string;
    segment: string | null;
  }>(sql, params);
  return result.rows;
}

async function snapshotAudience(
  campaignId: string,
  audience: Array<{ id: string; mobile: string }>,
  arm: "treatment" | "holdout" = "treatment"
) {
  for (const customer of audience) {
    await query(
      `INSERT INTO campaign_audiences (campaign_id, customer_id, mobile, arm)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (campaign_id, customer_id) DO NOTHING`,
      [campaignId, customer.id, customer.mobile, arm]
    );
  }
}

async function enqueueCampaignSend(
  campaignId: string,
  merchantId: string,
  templateName: string,
  audience: Array<{ id: string; mobile: string; name: string }>
) {
  const queue = getCampaignDispatchQueue();
  for (let i = 0; i < audience.length; i += BATCH_SIZE) {
    const batch = audience.slice(i, i + BATCH_SIZE);
    await queue.add(
      "campaign.dispatch.batch",
      {
        campaignId,
        merchantId,
        templateName,
        recipients: batch.map((c) => ({ customerId: c.id, mobile: c.mobile, name: c.name }))
      },
      { jobId: campaignBatchBullJobId(campaignId, i) }
    );
  }
}

export const campaignsRouter: Router = Router();

campaignsRouter.post("/", async (req, res) => {
  const body = campaignSchema.parse(req.body);
  const merchantId = req.auth!.merchantId;

  const template = await query<{ id: string; name: string }>(
    `SELECT id, name FROM templates
     WHERE id = $1 AND merchant_id = $2 AND is_global = FALSE
       AND archived_at IS NULL AND approval_status = 'approved'`,
    [body.templateId, merchantId]
  );
  if (!template.rowCount) {
    return sendError(req, res, "VALIDATION_ERROR", "Invalid or unavailable template", 422);
  }

  const foreign = await assertCustomersBelongToMerchant(merchantId, [
    ...body.manualIncludeIds,
    ...body.manualExcludeIds
  ]);
  if (foreign.length) {
    return sendError(
      req,
      res,
      "VALIDATION_ERROR",
      `${foreign.length} customer id(s) do not belong to this merchant`,
      422
    );
  }

  const inserted = await query(
    `INSERT INTO campaigns (
       merchant_id, template_id, campaign_name, status, scheduled_at,
       audience_rules, manual_include_ids, manual_exclude_ids,
       target_count, sent_count, delivered_count, failed_count
     )
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,0,0,0,0)
     RETURNING id, merchant_id AS "merchantId", template_id AS "templateId",
               campaign_name AS "campaignName", status, scheduled_at AS "scheduledAt",
               audience_rules AS "audienceRules", created_at AS "createdAt"`,
    [
      merchantId,
      body.templateId,
      body.campaignName,
      body.scheduledAt ? "scheduled" : "draft",
      body.scheduledAt ?? null,
      JSON.stringify(body.audienceRules),
      body.manualIncludeIds,
      body.manualExcludeIds
    ]
  );
  return sendSuccess(req, res, inserted.rows[0], 201);
});

campaignsRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;

  const items = await query(
    `SELECT id, merchant_id AS "merchantId", template_id AS "templateId",
            campaign_name AS "campaignName", status, scheduled_at AS "scheduledAt",
            target_count AS "targetCount", sent_count AS "sentCount",
            delivered_count AS "deliveredCount", failed_count AS "failedCount",
            audience_rules AS "audienceRules", created_at AS "createdAt",
            /* Per-recipient dispatch outcomes (migration 0024). "Sent 38 of 40"
               is a number with no explanation attached until you can see that
               two were skipped because they asked to stop. */
            d.breakdown AS "dispatch"
     FROM campaigns c0
     LEFT JOIN LATERAL (
       SELECT jsonb_object_agg(dispatch_status, n) AS breakdown
         FROM (
           SELECT dispatch_status, COUNT(*)::int AS n
             FROM campaign_audiences
            WHERE campaign_id = c0.id AND arm = 'treatment'
            GROUP BY dispatch_status
         ) s
     ) d ON TRUE
     WHERE merchant_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.auth!.merchantId, limit, offset]
  );
  return sendSuccess(req, res, { items: items.rows, page, limit });
});

campaignsRouter.get("/:id", async (req, res) => {
  const row = await query(
    `SELECT id, merchant_id AS "merchantId", template_id AS "templateId",
            campaign_name AS "campaignName", status, scheduled_at AS "scheduledAt",
            target_count AS "targetCount", sent_count AS "sentCount",
            delivered_count AS "deliveredCount", failed_count AS "failedCount",
            audience_rules AS "audienceRules",
            manual_include_ids AS "manualIncludeIds",
            manual_exclude_ids AS "manualExcludeIds",
            created_at AS "createdAt"
     FROM campaigns WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!row.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Campaign not found", 404);
  }
  return sendSuccess(req, res, row.rows[0]);
});

campaignsRouter.put("/:id", async (req, res) => {
  const body = campaignSchema.partial().parse(req.body);
  const existing = await query(
    `SELECT id FROM campaigns WHERE id = $1 AND merchant_id = $2 AND status IN ('draft','scheduled')`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!existing.rowCount) {
    return sendError(req, res, "CONFLICT", "Campaign cannot be edited in current status", 409);
  }

  const foreign = await assertCustomersBelongToMerchant(req.auth!.merchantId, [
    ...(body.manualIncludeIds ?? []),
    ...(body.manualExcludeIds ?? [])
  ]);
  if (foreign.length) {
    return sendError(
      req,
      res,
      "VALIDATION_ERROR",
      `${foreign.length} customer id(s) do not belong to this merchant`,
      422
    );
  }

  await query(
    `UPDATE campaigns SET
       campaign_name = COALESCE($1, campaign_name),
       template_id = COALESCE($2, template_id),
       audience_rules = COALESCE($3::jsonb, audience_rules),
       manual_include_ids = COALESCE($4, manual_include_ids),
       manual_exclude_ids = COALESCE($5, manual_exclude_ids),
       scheduled_at = COALESCE($6, scheduled_at),
       updated_at = NOW()
     WHERE id = $7 AND merchant_id = $8`,
    [
      body.campaignName ?? null,
      body.templateId ?? null,
      body.audienceRules ? JSON.stringify(body.audienceRules) : null,
      body.manualIncludeIds ?? null,
      body.manualExcludeIds ?? null,
      body.scheduledAt ?? null,
      req.params.id,
      req.auth!.merchantId
    ]
  );

  const updated = await query(
    `SELECT id, campaign_name AS "campaignName", status, audience_rules AS "audienceRules"
     FROM campaigns WHERE id = $1`,
    [req.params.id]
  );
  return sendSuccess(req, res, updated.rows[0]);
});

/**
 * Dry-run the audience before a campaign exists.
 *
 * `POST /:id/preview-audience` could only answer this *after* the campaign was
 * created, so a merchant committed to an audience they had never seen and then
 * checked. With behavioural segments now targetable, seeing who a rule actually
 * matches is the point of the rule — "at risk" means nothing until you can see
 * it is 12 people and not 400.
 *
 * Also reports the consent split, because "42 matched" and "42 will be
 * messaged" are different numbers whenever some of them have no record.
 */
campaignsRouter.post("/preview-audience", async (req, res) => {
  const schema = z.object({
    audienceRules: audienceRulesSchema.default({}),
    manualIncludeIds: z.array(z.string().uuid()).default([]),
    manualExcludeIds: z.array(z.string().uuid()).default([])
  });
  const body = schema.parse(req.body);
  const merchantId = req.auth!.merchantId;

  /* Returns the offending ids rather than throwing — the same guard as POST /
     and PUT /:id. A preview that quietly counted another merchant's customers
     would be a disclosure, not a miscount. */
  const foreign = await assertCustomersBelongToMerchant(merchantId, [
    ...body.manualIncludeIds,
    ...body.manualExcludeIds
  ]);
  if (foreign.length) {
    return sendError(
      req,
      res,
      "VALIDATION_ERROR",
      `${foreign.length} customer id(s) do not belong to this merchant`,
      422
    );
  }

  const audience = await resolveAudience(
    merchantId,
    body.audienceRules,
    body.manualIncludeIds,
    body.manualExcludeIds
  );

  /* The audience query already excludes anyone withdrawn, so the split here is
     between recorded consent and none — the number a merchant needs before
     deciding whether this send is one they should make. */
  const bySegment: Record<string, number> = {};
  for (const person of audience) {
    const key = person.segment ?? "unclassified";
    bySegment[key] = (bySegment[key] ?? 0) + 1;
  }

  const consentSplit = audience.length
    ? await query<{ granted: string; unknown: string }>(
        `SELECT COUNT(*) FILTER (WHERE consent_state = 'granted')::text AS granted,
                COUNT(*) FILTER (WHERE consent_state = 'unknown')::text AS unknown
           FROM customers WHERE merchant_id = $1 AND id = ANY($2::uuid[])`,
        [merchantId, audience.map((a) => a.id)]
      )
    : null;

  return sendSuccess(req, res, {
    count: audience.length,
    bySegment,
    consent: {
      granted: Number(consentSplit?.rows[0]?.granted ?? 0),
      unknown: Number(consentSplit?.rows[0]?.unknown ?? 0)
    },
    sample: audience.slice(0, 8)
  });
});

campaignsRouter.post("/:id/preview-audience", async (req, res) => {
  const campaign = await query<{
    audience_rules: AudienceRules;
    manual_include_ids: string[];
    manual_exclude_ids: string[];
  }>(
    `SELECT audience_rules, manual_include_ids, manual_exclude_ids
     FROM campaigns WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!campaign.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Campaign not found", 404);
  }

  const row = campaign.rows[0];
  const audience = await resolveAudience(
    req.auth!.merchantId,
    row.audience_rules ?? {},
    row.manual_include_ids ?? [],
    row.manual_exclude_ids ?? []
  );

  return sendSuccess(req, res, {
    count: audience.length,
    sample: audience.slice(0, 10)
  });
});

campaignsRouter.post("/:id/schedule", async (req, res) => {
  const schema = z.object({ scheduledAt: z.string().datetime() });
  const body = schema.parse(req.body);

  const campaign = await query<{
    audience_rules: AudienceRules;
    manual_include_ids: string[];
    manual_exclude_ids: string[];
  }>(
    `SELECT audience_rules, manual_include_ids, manual_exclude_ids
     FROM campaigns WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!campaign.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Campaign not found", 404);
  }

  const row = campaign.rows[0];
  const audience = await resolveAudience(
    req.auth!.merchantId,
    row.audience_rules ?? {},
    row.manual_include_ids ?? [],
    row.manual_exclude_ids ?? []
  );

  await snapshotAudience(req.params.id, audience);

  await query(
    `UPDATE campaigns SET scheduled_at = $1, status = 'scheduled', target_count = $2, updated_at = NOW()
     WHERE id = $3 AND merchant_id = $4`,
    [body.scheduledAt, audience.length, req.params.id, req.auth!.merchantId]
  );

  return sendSuccess(req, res, {
    campaignId: req.params.id,
    status: "scheduled",
    scheduledAt: body.scheduledAt,
    targetCount: audience.length
  });
});

campaignsRouter.post("/:id/send", async (req, res) => {
  const merchantId = req.auth!.merchantId;

  const campaign = await query<{
    template_id: string;
    audience_rules: AudienceRules;
    manual_include_ids: string[];
    manual_exclude_ids: string[];
    status: string;
    include_loyal_override: boolean;
  }>(
    `SELECT template_id, audience_rules, manual_include_ids, manual_exclude_ids,
            status, include_loyal_override
     FROM campaigns WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, merchantId]
  );
  if (!campaign.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Campaign not found", 404);
  }

  const row = campaign.rows[0];
  if (!["draft", "scheduled"].includes(row.status)) {
    return sendError(req, res, "CONFLICT", "Campaign already sent or in progress", 409);
  }

  const template = await query<{
    name: string;
    is_discount_offer: boolean;
    meta_template_name: string | null;
    meta_status: string | null;
    meta_rejected_reason: string | null;
  }>(
    `SELECT name, is_discount_offer, meta_template_name, meta_status, meta_rejected_reason
       FROM templates WHERE id = $1 AND merchant_id = $2`,
    [row.template_id, merchantId]
  );
  if (!template.rowCount) {
    return sendError(req, res, "VALIDATION_ERROR", "Template not found", 422);
  }

  /* M3 — the gate that did not exist. `approval_status` is Custva's own review
     flag and has never meant anything to Meta; a template that is not APPROVED
     on the WhatsApp Business Account will be refused at send time, one failed
     message at a time, after the campaign has already started. Refusing here
     turns that into a single clear error before anything is queued. */
  const meta = template.rows[0];
  if (meta.meta_status !== "APPROVED" || !meta.meta_template_name) {
    const detail =
      meta.meta_status === "REJECTED" && meta.meta_rejected_reason
        ? `Meta rejected it: ${meta.meta_rejected_reason}`
        : meta.meta_status
          ? `Its status at Meta is ${meta.meta_status}.`
          : "It has never been submitted to Meta.";
    return sendError(
      req,
      res,
      "VALIDATION_ERROR",
      `This template cannot be sent yet. ${detail}`,
      422
    );
  }

  const resolved = await resolveAudience(
    merchantId,
    row.audience_rules ?? {},
    row.manual_include_ids ?? [],
    row.manual_exclude_ids ?? []
  );

  /* FR-I2 / TR-5 — enforced here, on the send path, not in the UI. A merchant
     loses margin every time a discount reaches someone who was coming back
     anyway, and BR-2 makes protecting that margin a product promise rather
     than a suggestion. The override exists (FR-I2 allows it) but has to be set
     explicitly on the campaign. */
  const shielded =
    template.rows[0].is_discount_offer && !row.include_loyal_override
      ? resolved.filter((c) => c.segment !== "loyal")
      : resolved;
  const loyalWithheld = resolved.length - shielded.length;

  const audience = shielded;

  if (audience.length === 0) {
    return sendError(
      req,
      res,
      "VALIDATION_ERROR",
      loyalWithheld > 0
        ? `No customers match audience. ${loyalWithheld} loyal customer(s) were withheld from this discount offer — set includeLoyalOverride to reach them anyway.`
        : "No customers match audience",
      422
    );
  }

  /* Phase E — split the audience before anything is queued.
     Last-touch attribution can say "they got a message and came back". Only a
     held-out group can answer the merchant's actual objection, "they would have
     come back anyway", because the held-out group *is* those people.

     Assignment is deterministic on (campaignId, customerId): a retried send
     must never reshuffle the arms, or someone gets messaged twice and the
     experiment is destroyed. */
  const merchantSettings = await query<{ holdout_percent: string }>(
    `SELECT holdout_percent FROM merchants WHERE id = $1`,
    [merchantId]
  );
  const split = assignHoldout(audience, {
    campaignId: req.params.id,
    percent: Number(merchantSettings.rows[0]?.holdout_percent ?? 0)
  });

  await query(`DELETE FROM campaign_audiences WHERE campaign_id = $1`, [req.params.id]);
  await snapshotAudience(req.params.id, split.treatment, "treatment");
  await snapshotAudience(req.params.id, split.holdout, "holdout");

  /* Only the treatment arm is queued. The holdout is recorded and left alone —
     that is the entire point, and the cost of the measurement. */
  await enqueueCampaignSend(
    req.params.id,
    merchantId,
    meta.meta_template_name,
    split.treatment
  );

  await query(
    `UPDATE campaigns SET status = 'sending', target_count = $1,
            holdout_percent_used = $2, holdout_count = $3, treatment_count = $4,
            updated_at = NOW()
     WHERE id = $5 AND merchant_id = $6`,
    [
      split.treatment.length,
      split.holdout.length ? split.percentUsed : null,
      split.holdout.length,
      split.treatment.length,
      req.params.id,
      merchantId
    ]
  );

  return sendSuccess(req, res, {
    campaignId: req.params.id,
    status: "sending",
    queuedRecipients: split.treatment.length,
    loyalWithheld,
    holdout: {
      count: split.holdout.length,
      percentUsed: split.holdout.length ? split.percentUsed : 0,
      /* Present when no holdout was assigned, so the merchant knows why they
         will not get a lift number for this campaign. */
      skippedReason: split.skippedReason ?? null
    }
  });
});

/**
 * The lift a campaign actually caused.
 *
 * This is the number that answers "they would have come back anyway". It is
 * deliberately conservative: `computeLift` refuses to state a figure when the
 * sample is too small or the difference is inside normal variation, because a
 * confident wrong number here is what an invoice gets argued from.
 */
campaignsRouter.get("/:id/lift", async (req, res) => {
  const merchantId = req.auth!.merchantId;
  const windowDays = Math.min(60, Math.max(1, Number(req.query.windowDays ?? 14)));

  const campaign = await query<{
    id: string;
    campaign_name: string;
    holdout_count: number;
    treatment_count: number;
    holdout_percent_used: string | null;
    sent_at: Date | null;
  }>(
    `SELECT id, campaign_name, holdout_count, treatment_count, holdout_percent_used,
            updated_at AS sent_at
       FROM campaigns WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, merchantId]
  );
  if (!campaign.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Campaign not found", 404);
  }
  const c = campaign.rows[0];

  /* A "return" is a visit after the campaign went out, inside the window.
     Counted per arm from the audience snapshot, so the comparison is between
     the two groups as they were actually assigned. */
  const counts = await query<{ arm: string; size: string; returned: string }>(
    `SELECT ca.arm,
            COUNT(*)::text AS size,
            COUNT(*) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM customer_visits v
                 WHERE v.customer_id = ca.customer_id
                   AND v.visit_at > $2
                   AND v.visit_at <= $2 + ($3 * INTERVAL '1 day')
              )
            )::text AS returned
       FROM campaign_audiences ca
      WHERE ca.campaign_id = $1
      GROUP BY ca.arm`,
    [req.params.id, c.sent_at, windowDays]
  );

  const byArm = Object.fromEntries(
    counts.rows.map((r) => [r.arm, { size: Number(r.size), returned: Number(r.returned) }])
  ) as Record<string, { size: number; returned: number } | undefined>;

  const lift = computeLift({
    treatmentSize: byArm.treatment?.size ?? 0,
    treatmentReturned: byArm.treatment?.returned ?? 0,
    holdoutSize: byArm.holdout?.size ?? 0,
    holdoutReturned: byArm.holdout?.returned ?? 0
  });

  return sendSuccess(req, res, {
    campaignId: c.id,
    campaignName: c.campaign_name,
    windowDays,
    holdoutPercentUsed: c.holdout_percent_used ? Number(c.holdout_percent_used) : 0,
    ...lift
  });
});
