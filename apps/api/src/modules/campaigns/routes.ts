import { campaignBatchBullJobId } from "@custva/shared";
import { Router } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { query } from "../../lib/db.js";
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

async function resolveAudience(
  merchantId: string,
  rules: AudienceRules,
  manualIncludeIds: string[],
  manualExcludeIds: string[]
) {
  const { sql, params } = buildAudienceQuery(merchantId, rules, manualIncludeIds, manualExcludeIds);
  const result = await query<{ id: string; mobile: string; name: string }>(sql, params);
  return result.rows;
}

async function snapshotAudience(campaignId: string, audience: Array<{ id: string; mobile: string }>) {
  for (const customer of audience) {
    await query(
      `INSERT INTO campaign_audiences (campaign_id, customer_id, mobile)
       VALUES ($1,$2,$3)
       ON CONFLICT (campaign_id, customer_id) DO NOTHING`,
      [campaignId, customer.id, customer.mobile]
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
            audience_rules AS "audienceRules", created_at AS "createdAt"
     FROM campaigns WHERE merchant_id = $1
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
  }>(
    `SELECT template_id, audience_rules, manual_include_ids, manual_exclude_ids, status
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

  const template = await query<{ name: string }>(
    `SELECT name FROM templates WHERE id = $1 AND merchant_id = $2`,
    [row.template_id, merchantId]
  );
  if (!template.rowCount) {
    return sendError(req, res, "VALIDATION_ERROR", "Template not found", 422);
  }

  const audience = await resolveAudience(
    merchantId,
    row.audience_rules ?? {},
    row.manual_include_ids ?? [],
    row.manual_exclude_ids ?? []
  );

  if (audience.length === 0) {
    return sendError(req, res, "VALIDATION_ERROR", "No customers match audience", 422);
  }

  await query(`DELETE FROM campaign_audiences WHERE campaign_id = $1`, [req.params.id]);
  await snapshotAudience(req.params.id, audience);
  await enqueueCampaignSend(req.params.id, merchantId, template.rows[0].name, audience);

  await query(
    `UPDATE campaigns SET status = 'sending', target_count = $1, updated_at = NOW()
     WHERE id = $2 AND merchant_id = $3`,
    [audience.length, req.params.id, merchantId]
  );

  return sendSuccess(req, res, {
    campaignId: req.params.id,
    status: "sending",
    queuedRecipients: audience.length
  });
});
