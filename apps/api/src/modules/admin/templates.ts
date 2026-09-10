import { Router } from "express";
import { z } from "zod";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { query, withTransaction } from "../../lib/db.js";
import { writeAudit } from "../../lib/audit.js";
import {
  buildMetaTemplateComponents,
  toMetaTemplateName,
  validateTemplateForMeta
} from "@custva/shared";
import { WhatsAppCloudApiAdapter } from "@custva/whatsapp-adapters";
import {
  forkTemplateToMerchant,
  getGlobalTemplate,
  mapTemplateRow,
  pushGlobalUpdatesToMerchant,
  type TemplateRow
} from "../../lib/template-service.js";

const buttonSchema = z.object({
  type: z.enum(["url", "phone", "quick_reply"]),
  text: z.string().min(1).max(25),
  value: z.string().min(1).max(256)
});

const templateBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(4096),
  headerText: z.string().trim().max(60).optional().or(z.literal("")),
  headerImageUrl: z.string().url().optional().or(z.literal("")),
  footerText: z.string().trim().max(60).optional().or(z.literal("")),
  buttons: z.array(buttonSchema).max(3).default([]),
  languageCode: z.string().trim().max(10).default("en"),
  ctaLink: z.string().url().optional().or(z.literal("")),
  isStarterPack: z.boolean().optional()
});

const assignSchema = z.object({
  merchantIds: z.array(z.string().uuid()).optional(),
  filter: z
    .object({
      q: z.string().optional(),
      status: z.string().optional(),
      pincode: z.string().optional()
    })
    .optional(),
  selectAll: z.boolean().optional()
});

const pushSchema = z.object({
  merchantIds: z.array(z.string().uuid()).min(1),
  force: z.boolean().optional()
});

const PLATFORM_ADMIN_FILTER = `NOT EXISTS (
  SELECT 1 FROM users u WHERE u.merchant_id = m.id AND u.role = 'platform_admin'
)`;

const BULK_THRESHOLD = 50;

export const adminTemplatesRouter: Router = Router();

async function resolveMerchantIds(input: z.infer<typeof assignSchema>) {
  if (input.merchantIds?.length) {
    return input.merchantIds;
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.filter?.q) {
    conditions.push(
      `(m.business_name ILIKE $${idx} OR m.email ILIKE $${idx} OR m.name ILIKE $${idx})`
    );
    params.push(`%${input.filter.q}%`);
    idx++;
  }
  if (input.filter?.status) {
    conditions.push(`m.status = $${idx}`);
    params.push(input.filter.status);
    idx++;
  }
  if (input.filter?.pincode) {
    conditions.push(`m.pincode = $${idx}`);
    params.push(input.filter.pincode);
    idx++;
  }

  const whereExtra = conditions.length ? `AND ${conditions.join(" AND ")}` : "";
  const result = await query<{ id: string }>(
    `SELECT m.id FROM merchants m WHERE ${PLATFORM_ADMIN_FILTER} ${whereExtra}`,
    params
  );
  return result.rows.map((r) => r.id);
}

async function runAssign(globalId: string, merchantIds: string[]) {
  const global = await getGlobalTemplate(globalId);
  if (!global) throw new Error("Global template not found");

  const assigned: string[] = [];
  const skipped: string[] = [];

  for (const merchantId of merchantIds) {
    await withTransaction(async (client) => {
      const result = await forkTemplateToMerchant(client, global, merchantId);
      if (result.skipped) skipped.push(merchantId);
      else assigned.push(merchantId);
    });
  }

  return { assigned: assigned.length, skipped: skipped.length, merchantIds: assigned };
}

async function runPush(globalId: string, merchantIds: string[], force: boolean) {
  const global = await getGlobalTemplate(globalId);
  if (!global) throw new Error("Global template not found");

  let updated = 0;
  let skipped = 0;

  for (const merchantId of merchantIds) {
    await withTransaction(async (client) => {
      const result = await pushGlobalUpdatesToMerchant(client, global, merchantId, force);
      if (result.updated) updated++;
      else skipped++;
    });
  }

  return { updated, skipped };
}

async function enqueueBulkJob(jobType: string, payload: Record<string, unknown>) {
  const result = await query<{ id: string }>(
    `INSERT INTO admin_bulk_jobs (job_type, status, payload)
     VALUES ($1, 'pending', $2::jsonb)
     RETURNING id`,
    [jobType, JSON.stringify(payload)]
  );
  const jobId = result.rows[0].id;

  setImmediate(async () => {
    try {
      await query(`UPDATE admin_bulk_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1`, [
        jobId
      ]);

      let jobResult: Record<string, unknown>;
      if (jobType === "template.assign") {
        jobResult = await runAssign(
          payload.globalTemplateId as string,
          payload.merchantIds as string[]
        );
      } else {
        jobResult = await runPush(
          payload.globalTemplateId as string,
          payload.merchantIds as string[],
          Boolean(payload.force)
        );
      }

      await query(
        `UPDATE admin_bulk_jobs SET status = 'completed', result = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(jobResult), jobId]
      );
    } catch (error) {
      await query(
        `UPDATE admin_bulk_jobs SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [error instanceof Error ? error.message : "Unknown error", jobId]
      );
    }
  });

  return jobId;
}

adminTemplatesRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const includeArchived = req.query.includeArchived === "true";

  const archivedFilter = includeArchived ? "" : "AND archived_at IS NULL";

  const count = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM templates
     WHERE is_global = TRUE ${archivedFilter}`
  );

  const items = await query(
    `SELECT t.*,
            (SELECT COUNT(*)::int FROM templates c
             WHERE c.source_template_id = t.id AND c.archived_at IS NULL) AS "assignedCount"
     FROM templates t
     WHERE t.is_global = TRUE ${archivedFilter}
     ORDER BY t.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return sendSuccess(req, res, {
    items: items.rows.map((row) => ({
      ...mapTemplateRow(row as TemplateRow),
      assignedCount: Number((row as { assignedCount: number }).assignedCount ?? 0)
    })),
    page,
    limit,
    total: Number(count.rows[0].count)
  });
});

adminTemplatesRouter.post("/", async (req, res) => {
  const body = templateBodySchema.parse(req.body);
  const inserted = await query<TemplateRow>(
    `INSERT INTO templates (
       merchant_id, name, category, body, header_text, header_image_url, footer_text, buttons,
       language_code, cta_link, is_global, approval_status, is_starter_pack
     )
     VALUES (NULL, $1, 'cafe', $2, $3, $4, $5, $6::jsonb, $7, $8, TRUE, 'approved', $9)
     RETURNING *`,
    [
      body.name,
      body.body,
      body.headerText || null,
      body.headerImageUrl || null,
      body.footerText || null,
      JSON.stringify(body.buttons),
      body.languageCode,
      body.ctaLink || null,
      body.isStarterPack ?? false
    ]
  );

  const mapped = mapTemplateRow(inserted.rows[0]);
  await writeAudit(req, "template.create", "template", mapped.id, null, mapped);
  return sendSuccess(req, res, mapped, 201);
});

adminTemplatesRouter.get("/:id", async (req, res) => {
  const row = await query<TemplateRow>(
    `SELECT * FROM templates WHERE id = $1 AND is_global = TRUE`,
    [req.params.id]
  );
  if (!row.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Template not found", 404);
  }
  return sendSuccess(req, res, mapTemplateRow(row.rows[0]));
});

adminTemplatesRouter.put("/:id", async (req, res) => {
  const body = templateBodySchema.parse(req.body);
  const beforeRow = await query<TemplateRow>(
    `SELECT * FROM templates WHERE id = $1 AND is_global = TRUE AND archived_at IS NULL`,
    [req.params.id]
  );
  if (!beforeRow.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Template not found", 404);
  }

  const updated = await query<TemplateRow>(
    `UPDATE templates SET
       name = $1, body = $2, header_text = $3, header_image_url = $4, footer_text = $5,
       buttons = $6::jsonb, language_code = $7, cta_link = $8,
       is_starter_pack = COALESCE($9, is_starter_pack),
       version = version + 1, updated_at = NOW()
     WHERE id = $10
     RETURNING *`,
    [
      body.name,
      body.body,
      body.headerText || null,
      body.headerImageUrl || null,
      body.footerText || null,
      JSON.stringify(body.buttons),
      body.languageCode,
      body.ctaLink || null,
      body.isStarterPack ?? null,
      req.params.id
    ]
  );

  const mapped = mapTemplateRow(updated.rows[0]);
  await writeAudit(
    req,
    "template.update",
    "template",
    req.params.id,
    mapTemplateRow(beforeRow.rows[0]),
    mapped
  );
  return sendSuccess(req, res, mapped);
});

adminTemplatesRouter.post("/:id/archive", async (req, res) => {
  const beforeRow = await query<TemplateRow>(
    `SELECT * FROM templates WHERE id = $1 AND is_global = TRUE AND archived_at IS NULL`,
    [req.params.id]
  );
  if (!beforeRow.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Template not found", 404);
  }

  await query(`UPDATE templates SET archived_at = NOW(), updated_at = NOW() WHERE id = $1`, [
    req.params.id
  ]);

  await writeAudit(req, "template.archive", "template", req.params.id, mapTemplateRow(beforeRow.rows[0]), {
    archived: true
  });

  return sendSuccess(req, res, { id: req.params.id, archived: true });
});

adminTemplatesRouter.get("/:id/assignments", async (req, res) => {
  const global = await getGlobalTemplate(req.params.id);
  if (!global) {
    const archived = await query<TemplateRow>(
      `SELECT * FROM templates WHERE id = $1 AND is_global = TRUE`,
      [req.params.id]
    );
    if (!archived.rowCount) {
      return sendError(req, res, "RESOURCE_NOT_FOUND", "Template not found", 404);
    }
  }

  const rows = await query(
    `SELECT c.id AS "copyId", c.merchant_id AS "merchantId", m.business_name AS "shopName",
            c.source_version AS "sourceVersion", g.version AS "globalVersion",
            c.is_locally_modified AS "isLocallyModified",
            (c.source_version < g.version) AS "hasVersionDrift"
     FROM templates c
     JOIN templates g ON g.id = c.source_template_id
     JOIN merchants m ON m.id = c.merchant_id
     WHERE c.source_template_id = $1 AND c.archived_at IS NULL
     ORDER BY m.business_name ASC`,
    [req.params.id]
  );

  return sendSuccess(req, res, { items: rows.rows });
});

adminTemplatesRouter.post("/:id/assign", async (req, res) => {
  const body = assignSchema.parse(req.body);
  const merchantIds = await resolveMerchantIds(body);

  if (merchantIds.length === 0) {
    return sendError(req, res, "VALIDATION_ERROR", "No merchants matched", 422);
  }

  if (merchantIds.length > BULK_THRESHOLD) {
    const jobId = await enqueueBulkJob("template.assign", {
      globalTemplateId: req.params.id,
      merchantIds
    });
    return sendSuccess(req, res, { async: true, jobId, merchantCount: merchantIds.length }, 202);
  }

  const result = await runAssign(req.params.id, merchantIds);
  await writeAudit(req, "template.assign", "template", req.params.id, null, result);
  return sendSuccess(req, res, result);
});

adminTemplatesRouter.post("/:id/push-updates", async (req, res) => {
  const body = pushSchema.parse(req.body);

  if (body.merchantIds.length > BULK_THRESHOLD) {
    const jobId = await enqueueBulkJob("template.push", {
      globalTemplateId: req.params.id,
      merchantIds: body.merchantIds,
      force: body.force ?? false
    });
    return sendSuccess(req, res, { async: true, jobId, merchantCount: body.merchantIds.length }, 202);
  }

  const result = await runPush(req.params.id, body.merchantIds, body.force ?? false);
  await writeAudit(req, "template.push", "template", req.params.id, null, result);
  return sendSuccess(req, res, result);
});


/* ── Meta template lifecycle (Phase M) ──────────────────────────────────────
   `approval_status` above is Custva's internal review flag and means nothing to
   Meta. These three routes are what actually make a template sendable. */

function templateAdmin() {
  if (!process.env.WA_ACCESS_TOKEN || !process.env.WA_BUSINESS_ACCOUNT_ID) {
    return null;
  }
  return new WhatsAppCloudApiAdapter({
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.WA_ACCESS_TOKEN,
    businessAccountId: process.env.WA_BUSINESS_ACCOUNT_ID
  });
}

/**
 * Dry run. Meta's review is slow and its rejection reasons are terse, so every
 * structural problem caught here is a review cycle saved.
 */
adminTemplatesRouter.post("/:id/validate-for-meta", async (req, res) => {
  const t = await query<{
    name: string; body: string; header_text: string | null;
    footer_text: string | null; buttons: Array<{ type: string; text: string }>;
  }>(
    `SELECT name, body, header_text, footer_text, buttons FROM templates WHERE id = $1`,
    [req.params.id]
  );
  if (!t.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Template not found", 404);
  }
  const row = t.rows[0];
  const problems = validateTemplateForMeta({
    name: row.name,
    body: row.body,
    headerText: row.header_text,
    footerText: row.footer_text,
    buttons: row.buttons
  });
  return sendSuccess(req, res, {
    metaTemplateName: toMetaTemplateName(row.name),
    submittable: problems.length === 0,
    problems
  });
});

/** Submit for Meta review. Approval is asynchronous — expect PENDING back. */
adminTemplatesRouter.post("/:id/submit-to-meta", async (req, res) => {
  const adapter = templateAdmin();
  if (!adapter) {
    return sendError(
      req, res, "PROVIDER_ERROR",
      "WA_ACCESS_TOKEN and WA_BUSINESS_ACCOUNT_ID must be configured to submit templates",
      503
    );
  }

  const t = await query<{
    id: string; merchant_id: string | null; name: string; body: string;
    header_text: string | null; header_image_handle: string | null;
    footer_text: string | null; language_code: string;
    buttons: Array<{ type: string; text: string; value?: string }>;
    meta_category: string | null;
  }>(
    `SELECT id, merchant_id, name, body, header_text, header_image_handle,
            footer_text, language_code, buttons, meta_category
       FROM templates WHERE id = $1 AND archived_at IS NULL`,
    [req.params.id]
  );
  if (!t.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Template not found", 404);
  }
  const row = t.rows[0];

  const problems = validateTemplateForMeta({
    name: row.name, body: row.body,
    headerText: row.header_text, footerText: row.footer_text, buttons: row.buttons
  });
  if (problems.length) {
    return sendError(
      req, res, "VALIDATION_ERROR",
      "Template would be rejected by Meta", 422,
      problems.map((p) => ({ field: p.field, issue: p.issue }))
    );
  }

  const metaName = toMetaTemplateName(row.name);
  const category = (row.meta_category ?? "MARKETING") as
    "MARKETING" | "UTILITY" | "AUTHENTICATION";

  try {
    const created = await adapter.createTemplate({
      name: metaName,
      category,
      languageCode: row.language_code ?? "en",
      components: buildMetaTemplateComponents({
        body: row.body,
        headerText: row.header_text,
        headerImageHandle: row.header_image_handle,
        footerText: row.footer_text,
        buttons: row.buttons
      }) as unknown as Array<Record<string, unknown>>
    });

    await query(
      `UPDATE templates
          SET meta_template_name = $1, meta_template_id = $2, meta_status = $3,
              meta_category = $4, meta_rejected_reason = NULL,
              meta_submitted_at = NOW(), meta_synced_at = NOW(), updated_at = NOW()
        WHERE id = $5`,
      [metaName, created.metaTemplateId, created.status, category, row.id]
    );

    await writeAudit(
      req,
      "template.submitted_to_meta",
      "template",
      row.id,
      null,
      { metaTemplateName: metaName, status: created.status }
    );

    return sendSuccess(req, res, {
      metaTemplateName: metaName,
      metaTemplateId: created.metaTemplateId,
      status: created.status
    });
  } catch (error) {
    return sendError(
      req, res, "PROVIDER_ERROR",
      error instanceof Error ? error.message : "Template submission failed",
      502
    );
  }
});

/** Poll Meta for the current review state and store it. */
adminTemplatesRouter.post("/:id/sync-meta-status", async (req, res) => {
  const adapter = templateAdmin();
  if (!adapter) {
    return sendError(req, res, "PROVIDER_ERROR", "Meta credentials not configured", 503);
  }

  const t = await query<{ id: string; meta_template_name: string | null }>(
    `SELECT id, meta_template_name FROM templates WHERE id = $1`,
    [req.params.id]
  );
  if (!t.rowCount || !t.rows[0].meta_template_name) {
    return sendError(
      req, res, "VALIDATION_ERROR",
      "Template has not been submitted to Meta yet", 422
    );
  }

  try {
    const status = await adapter.fetchTemplateStatus(t.rows[0].meta_template_name);
    if (!status) {
      return sendError(
        req, res, "RESOURCE_NOT_FOUND",
        "Meta does not know this template name. It may have been deleted there.", 404
      );
    }

    await query(
      `UPDATE templates
          SET meta_status = $1, meta_template_id = $2, meta_rejected_reason = $3,
              meta_synced_at = NOW(), updated_at = NOW()
        WHERE id = $4`,
      [status.status, status.metaTemplateId, status.rejectedReason ?? null, t.rows[0].id]
    );

    return sendSuccess(req, res, {
      status: status.status,
      rejectedReason: status.rejectedReason ?? null,
      sendable: status.status === "APPROVED"
    });
  } catch (error) {
    return sendError(
      req, res, "PROVIDER_ERROR",
      error instanceof Error ? error.message : "Status sync failed",
      502
    );
  }
});

export const adminJobsRouter: Router = Router();

adminJobsRouter.get("/:id", async (req, res) => {
  const job = await query(
    `SELECT id, job_type AS "jobType", status, payload, result, error_message AS "errorMessage",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM admin_bulk_jobs WHERE id = $1`,
    [req.params.id]
  );
  if (!job.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  return sendSuccess(req, res, job.rows[0]);
});
