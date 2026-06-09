import { Router } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { query } from "../../lib/db.js";
import { requireRole } from "../../middleware/auth.js";
import { mapTemplateRow, type TemplateRow } from "../../lib/template-service.js";

const buttonSchema = z.object({
  type: z.enum(["url", "phone", "quick_reply"]),
  text: z.string().min(1).max(25),
  value: z.string().min(1).max(256)
});

const createTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(4096),
  headerText: z.string().trim().max(60).optional().or(z.literal("")),
  footerText: z.string().trim().max(60).optional().or(z.literal("")),
  buttons: z.array(buttonSchema).max(3).default([]),
  languageCode: z.string().trim().max(10).default("en"),
  ctaLink: z.string().url().optional().or(z.literal(""))
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  body: z.string().trim().min(1).max(4096).optional(),
  headerText: z.string().trim().max(60).optional().or(z.literal("")),
  footerText: z.string().trim().max(60).optional().or(z.literal("")),
  buttons: z.array(buttonSchema).max(3).optional(),
  languageCode: z.string().trim().max(10).optional(),
  ctaLink: z.string().url().optional().or(z.literal(""))
});

export const templatesRouter: Router = Router();

templatesRouter.use(requireRole(["merchant_admin", "merchant_staff"]));

templatesRouter.get("/", async (req, res) => {
  const merchantId = req.auth!.merchantId;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;

  const count = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM templates
     WHERE merchant_id = $1 AND is_global = FALSE AND archived_at IS NULL`,
    [merchantId]
  );

  const items = await query<TemplateRow>(
    `SELECT * FROM templates
     WHERE merchant_id = $1 AND is_global = FALSE AND archived_at IS NULL
     ORDER BY
       CASE visit_group
         WHEN 'first_visit' THEN 1
         WHEN 'second_visit' THEN 2
         WHEN 'third_visit' THEN 3
         WHEN 'fourth_visit' THEN 4
         ELSE 5
       END,
       CASE lifecycle_day
         WHEN 'day_0' THEN 1
         WHEN 'day_3' THEN 2
         WHEN 'day_7' THEN 3
         WHEN 'day_14' THEN 4
         ELSE 5
       END,
       created_at DESC
     LIMIT $2 OFFSET $3`,
    [merchantId, limit, offset]
  );

  return sendSuccess(req, res, {
    items: items.rows.map(mapTemplateRow),
    page,
    limit,
    total: Number(count.rows[0].count)
  });
});

templatesRouter.post("/", async (req, res) => {
  const body = createTemplateSchema.parse(req.body);
  const merchantId = req.auth!.merchantId;

  const inserted = await query<TemplateRow>(
    `INSERT INTO templates (
       merchant_id, name, category, body, header_text, footer_text, buttons,
       language_code, cta_link, is_global, approval_status, is_locally_modified
     )
     VALUES ($1, $2, 'cafe', $3, $4, $5, $6::jsonb, $7, $8, FALSE, 'approved', TRUE)
     RETURNING *`,
    [
      merchantId,
      body.name,
      body.body,
      body.headerText || null,
      body.footerText || null,
      JSON.stringify(body.buttons),
      body.languageCode,
      body.ctaLink || null
    ]
  );

  return sendSuccess(req, res, mapTemplateRow(inserted.rows[0]), 201);
});

templatesRouter.get("/:id", async (req, res) => {
  const row = await query<TemplateRow>(
    `SELECT * FROM templates
     WHERE id = $1 AND merchant_id = $2 AND is_global = FALSE AND archived_at IS NULL`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!row.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Template not found", 404);
  }
  return sendSuccess(req, res, mapTemplateRow(row.rows[0]));
});

templatesRouter.put("/:id", async (req, res) => {
  const body = updateTemplateSchema.parse(req.body);
  const existing = await query<TemplateRow>(
    `SELECT * FROM templates
     WHERE id = $1 AND merchant_id = $2 AND is_global = FALSE AND archived_at IS NULL`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!existing.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Template not found", 404);
  }

  const current = existing.rows[0];
  const updated = await query<TemplateRow>(
    `UPDATE templates SET
       name = COALESCE($1, name),
       body = COALESCE($2, body),
       header_text = COALESCE($3, header_text),
       footer_text = COALESCE($4, footer_text),
       buttons = COALESCE($5::jsonb, buttons),
       language_code = COALESCE($6, language_code),
       cta_link = COALESCE($7, cta_link),
       is_locally_modified = TRUE,
       updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [
      body.name ?? null,
      body.body ?? null,
      body.headerText ?? null,
      body.footerText ?? null,
      body.buttons ? JSON.stringify(body.buttons) : null,
      body.languageCode ?? null,
      body.ctaLink ?? null,
      req.params.id
    ]
  );

  return sendSuccess(req, res, mapTemplateRow(updated.rows[0]));
});

templatesRouter.delete("/:id", async (req, res) => {
  const existing = await query(
    `SELECT id FROM templates
     WHERE id = $1 AND merchant_id = $2 AND is_global = FALSE AND archived_at IS NULL`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!existing.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Template not found", 404);
  }

  const activeCampaign = await query(
    `SELECT id FROM campaigns
     WHERE template_id = $1 AND merchant_id = $2 AND status IN ('scheduled', 'sending')
     LIMIT 1`,
    [req.params.id, req.auth!.merchantId]
  );
  if (activeCampaign.rowCount) {
    return sendError(
      req,
      res,
      "CONFLICT",
      "Template is used in an active campaign",
      409
    );
  }

  await query(`UPDATE templates SET archived_at = NOW(), updated_at = NOW() WHERE id = $1`, [
    req.params.id
  ]);

  return sendSuccess(req, res, { id: req.params.id, archived: true });
});
