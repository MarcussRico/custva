import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../../lib/db.js";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { normalizeIndiaMobile, isValidIndiaMobile } from "../../lib/mobile.js";
import { buildCustomerListQuery, customerListFilterSchema } from "../../lib/audience-engine.js";
import { autoTagsSql } from "../../lib/customer-tags.js";
import { projectVisitMetrics } from "../../lib/metrics-projection.js";
import {
  enrollAfterVisit,
  enqueueLifecycleJobs,
  removeLifecycleQueueJobs
} from "../../lib/lifecycle-service.js";

const createCustomerSchema = z.object({
  name: z.string().min(2),
  mobile: z.string().min(8),
  billingAmount: z.number().nonnegative(),
  pincode: z.string().regex(/^\d{6}$/).optional().or(z.literal("")),
  age: z.number().int().min(1).max(120).optional(),
  notes: z.string().optional(),
  visitDate: z.string().datetime().optional()
});

const CUSTOMER_SELECT = `
  id, merchant_id AS "merchantId", name, mobile, pincode, age, location, notes,
  total_spend AS "totalSpend", total_visits AS "totalVisits", last_visit AS "lastVisit",
  whatsapp_opt_in AS "whatsappOptIn", created_at AS "createdAt", updated_at AS "updatedAt"
`;

export const customersRouter: Router = Router();

customersRouter.get("/recent", async (req, res) => {
  const merchantId = req.auth!.merchantId;
  const items = await query(
    `SELECT ${CUSTOMER_SELECT}, ${autoTagsSql("customers")} AS "autoTags"
     FROM customers
     WHERE merchant_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [merchantId]
  );
  return sendSuccess(req, res, { items: items.rows });
});

customersRouter.get("/lookup", async (req, res) => {
  const merchantId = req.auth!.merchantId;
  const schema = z.object({
    mobilePrefix: z.string().min(1).max(12),
    limit: z.coerce.number().min(1).max(10).default(5)
  });
  const { mobilePrefix, limit } = schema.parse(req.query);
  const digits = mobilePrefix.replace(/\D/g, "");
  if (!digits.length) {
    return sendSuccess(req, res, { items: [] });
  }
  const prefix = `+91${digits}%`;

  const items = await query(
    `SELECT ${CUSTOMER_SELECT}, ${autoTagsSql("customers")} AS "autoTags"
     FROM customers
     WHERE merchant_id = $1 AND mobile LIKE $2
     ORDER BY mobile ASC
     LIMIT $3`,
    [merchantId, prefix, limit]
  );
  return sendSuccess(req, res, { items: items.rows });
});

customersRouter.post("/", async (req, res) => {
  const body = createCustomerSchema.parse(req.body);
  const merchantId = req.auth!.merchantId;

  if (!isValidIndiaMobile(body.mobile)) {
    return sendError(req, res, "VALIDATION_ERROR", "Invalid mobile number", 422, [
      { field: "mobile", issue: "Must be a valid Indian mobile number" }
    ]);
  }

  const mobile = normalizeIndiaMobile(body.mobile);
  const visitDate = body.visitDate ?? new Date().toISOString();
  const pincode = body.pincode && body.pincode.length === 6 ? body.pincode : null;

  let lifecycleJobs: Awaited<ReturnType<typeof enrollAfterVisit>>["jobs"] = [];
  let cancelledJobIds: string[] = [];

  const result = await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM customers WHERE merchant_id = $1 AND mobile = $2 LIMIT 1",
      [merchantId, mobile]
    );

    let customerId = existing.rows[0]?.id;
    let isNew = false;

    if (!customerId) {
      isNew = true;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO customers (
           merchant_id, name, mobile, pincode, age, location, notes,
           total_spend, total_visits, last_visit, whatsapp_opt_in
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,TRUE)
         RETURNING id`,
        [
          merchantId,
          body.name,
          mobile,
          pincode,
          body.age ?? null,
          pincode ?? "",
          body.notes ?? null,
          body.billingAmount,
          visitDate
        ]
      );
      customerId = inserted.rows[0].id;
    } else {
      await client.query(
        `UPDATE customers SET
           name = $1,
           pincode = COALESCE($2, pincode),
           age = COALESCE($3, age),
           total_spend = total_spend + $4,
           total_visits = total_visits + 1,
           last_visit = $5,
           updated_at = NOW()
         WHERE id = $6 AND merchant_id = $7`,
        [body.name, pincode, body.age ?? null, body.billingAmount, visitDate, customerId, merchantId]
      );
    }

    const visitInsert = await client.query<{ id: string }>(
      `INSERT INTO customer_visits (merchant_id, customer_id, billing_amount, visit_at, age_at_visit, notes, is_repeat_visit)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [merchantId, customerId, body.billingAmount, visitDate, body.age ?? null, body.notes ?? null, !isNew]
    );
    const visitId = visitInsert.rows[0].id;

    await projectVisitMetrics(client, merchantId, body.billingAmount, isNew);

    const counts = await client.query<{ total_visits: number }>(
      `SELECT total_visits FROM customers WHERE id = $1`,
      [customerId]
    );

    const enrolled = await enrollAfterVisit(client, {
      merchantId,
      customerId,
      visitId,
      visitAt: new Date(visitDate),
      totalVisitsAfter: counts.rows[0].total_visits
    });
    lifecycleJobs = enrolled.jobs;
    cancelledJobIds = enrolled.cancelledJobIds;

    const row = await client.query(
      `SELECT ${CUSTOMER_SELECT}, ${autoTagsSql("customers")} AS "autoTags" FROM customers WHERE id = $1`,
      [customerId]
    );
    return row.rows[0];
  });

  await removeLifecycleQueueJobs(cancelledJobIds);
  await enqueueLifecycleJobs(lifecycleJobs);

  return sendSuccess(req, res, result, 201);
});

customersRouter.get("/", async (req, res) => {
  const parsed = customerListFilterSchema.parse(req.query);
  const merchantId = req.auth!.merchantId;
  const { itemsSql, countSql, params, countParams } = buildCustomerListQuery(merchantId, parsed);

  const items = await query(itemsSql, params);
  const total = await query<{ count: string }>(countSql, countParams);

  return res.status(200).json({
    success: true,
    data: { items: items.rows },
    meta: {
      requestId: String(res.locals.requestId ?? "n/a"),
      page: parsed.page,
      limit: parsed.limit,
      total: Number(total.rows[0].count)
    }
  });
});

customersRouter.get("/:id/visits", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = (page - 1) * limit;

  const visits = await query(
    `SELECT id, billing_amount AS "billingAmount", visit_at AS "visitAt",
            age_at_visit AS "ageAtVisit", notes, created_at AS "createdAt"
     FROM customer_visits
     WHERE customer_id = $1 AND merchant_id = $2
     ORDER BY visit_at DESC
     LIMIT $3 OFFSET $4`,
    [req.params.id, req.auth!.merchantId, limit, offset]
  );

  const total = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customer_visits WHERE customer_id = $1 AND merchant_id = $2`,
    [req.params.id, req.auth!.merchantId]
  );

  return sendSuccess(req, res, {
    items: visits.rows,
    page,
    limit,
    total: Number(total.rows[0].count)
  });
});

customersRouter.get("/:id", async (req, res) => {
  const item = await query(
    `SELECT ${CUSTOMER_SELECT}, ${autoTagsSql("customers")} AS "autoTags"
     FROM customers WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!item.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  const visits = await query(
    `SELECT id, billing_amount AS "billingAmount", visit_at AS "visitAt",
            age_at_visit AS "ageAtVisit", notes
     FROM customer_visits
     WHERE customer_id = $1 AND merchant_id = $2
     ORDER BY visit_at DESC
     LIMIT 20`,
    [req.params.id, req.auth!.merchantId]
  );

  return sendSuccess(req, res, { ...item.rows[0], visits: visits.rows });
});

customersRouter.put("/:id", async (req, res) => {
  const updateSchema = z.object({
    name: z.string().min(2).optional(),
    pincode: z.string().regex(/^\d{6}$/).optional(),
    age: z.number().int().min(1).max(120).optional(),
    notes: z.string().optional()
  });
  const patch = updateSchema.parse(req.body);
  const existing = await query<{ id: string }>(
    "SELECT id FROM customers WHERE id = $1 AND merchant_id = $2",
    [req.params.id, req.auth!.merchantId]
  );
  if (!existing.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Customer not found", 404);
  }
  await query(
    `UPDATE customers SET
       name = COALESCE($1, name),
       pincode = COALESCE($2, pincode),
       age = COALESCE($3, age),
       notes = COALESCE($4, notes),
       updated_at = NOW()
     WHERE id = $5 AND merchant_id = $6`,
    [patch.name ?? null, patch.pincode ?? null, patch.age ?? null, patch.notes ?? null, req.params.id, req.auth!.merchantId]
  );
  const updated = await query(
    `SELECT ${CUSTOMER_SELECT}, ${autoTagsSql("customers")} AS "autoTags" FROM customers WHERE id = $1`,
    [req.params.id]
  );
  return sendSuccess(req, res, updated.rows[0]);
});

customersRouter.delete("/:id", async (req, res) => {
  await query("DELETE FROM customers WHERE id = $1 AND merchant_id = $2", [
    req.params.id,
    req.auth!.merchantId
  ]);
  return sendSuccess(req, res, { deleted: true });
});
