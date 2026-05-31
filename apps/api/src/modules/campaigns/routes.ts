import { Router } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { query } from "../../lib/db.js";
import { getCampaignDispatchQueue } from "../../lib/queue.js";

const campaignSchema = z.object({
  campaignName: z.string().min(3),
  templateId: z.string().min(1),
  audienceRules: z.record(z.unknown()).default({}),
  ctaLink: z.string().url().optional(),
  scheduledAt: z.string().datetime().optional()
});

export const campaignsRouter: Router = Router();

campaignsRouter.post("/", async (req, res) => {
  const body = campaignSchema.parse(req.body);
  const merchantId = req.auth!.merchantId;
  const inserted = await query(
    `INSERT INTO campaigns (merchant_id, template_id, campaign_name, status, scheduled_at, target_count, sent_count, delivered_count, failed_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, merchant_id AS "merchantId", template_id AS "templateId", campaign_name AS "campaignName", status, scheduled_at AS "scheduledAt", target_count AS "targetCount", sent_count AS "sentCount", created_at AS "createdAt"`,
    [
      merchantId,
      body.templateId,
      body.campaignName,
      body.scheduledAt ? "scheduled" : "draft",
      body.scheduledAt ?? null,
      0,
      0,
      0,
      0
    ]
  );
  return sendSuccess(req, res, inserted.rows[0], 201);
});

campaignsRouter.get("/", async (req, res) => {
  const items = await query(
    `SELECT id, merchant_id AS "merchantId", template_id AS "templateId", campaign_name AS "campaignName", status, scheduled_at AS "scheduledAt", target_count AS "targetCount", sent_count AS "sentCount", delivered_count AS "deliveredCount", failed_count AS "failedCount", created_at AS "createdAt"
     FROM campaigns WHERE merchant_id = $1 ORDER BY created_at DESC`,
    [req.auth!.merchantId]
  );
  return sendSuccess(req, res, { items: items.rows });
});

campaignsRouter.get("/:id", async (req, res) => {
  const row = await query(
    `SELECT id, merchant_id AS "merchantId", template_id AS "templateId", campaign_name AS "campaignName", status, scheduled_at AS "scheduledAt", target_count AS "targetCount", sent_count AS "sentCount", delivered_count AS "deliveredCount", failed_count AS "failedCount", created_at AS "createdAt"
     FROM campaigns WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.auth!.merchantId]
  );
  return sendSuccess(req, res, row.rows[0] ?? null);
});

campaignsRouter.post("/:id/schedule", async (req, res) => {
  const schema = z.object({ scheduledAt: z.string().datetime() });
  const body = schema.parse(req.body);
  await query(
    "UPDATE campaigns SET scheduled_at = $1, status = 'scheduled', updated_at = NOW() WHERE id = $2 AND merchant_id = $3",
    [body.scheduledAt, req.params.id, req.auth!.merchantId]
  );
  return sendSuccess(req, res, {
    campaignId: req.params.id,
    status: "scheduled",
    scheduledAt: body.scheduledAt
  });
});

campaignsRouter.post("/:id/send", async (req, res) => {
  const merchantId = req.auth!.merchantId;
  const customers = await query<{ id: string; mobile: string }>(
    "SELECT id, mobile FROM customers WHERE merchant_id = $1 ORDER BY updated_at DESC LIMIT 200",
    [merchantId]
  );

  for (const customer of customers.rows) {
    await campaignDispatchQueue.add(
      "campaign.dispatch",
      {
        campaignId: req.params.id,
        merchantId,
        customerId: customer.id,
        mobile: customer.mobile
      },
      {
        jobId: `${req.params.id}:${customer.id}`
      }
    );
  }

  await query(
    "UPDATE campaigns SET status = 'sending', target_count = $1, updated_at = NOW() WHERE id = $2 AND merchant_id = $3",
    [customers.rowCount, req.params.id, merchantId]
  );

  return sendSuccess(req, res, {
    campaignId: req.params.id,
    status: "sending",
    queuedRecipients: customers.rowCount ?? 0
  });
});
