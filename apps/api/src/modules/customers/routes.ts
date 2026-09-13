import { Router } from "express";
import { z } from "zod";
import type { Segment } from "@custva/shared";
import { getConsentHistory, recordConsent } from "../../lib/consent-service.js";
import { query, withTransaction } from "../../lib/db.js";
import { recomputeSegmentForCustomer } from "../../lib/segmentation-service.js";
import { attributeVisit } from "../../lib/attribution-service.js";
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
  visitDate: z.string().datetime().optional(),
  /* Consent captured at the counter, at the one moment the customer is
     actually standing there. Optional, because staff will not always ask and a
     silent default of "yes" is exactly what this replaces — omitting it leaves
     the customer `unknown`, which is the truth. */
  consent: z
    .object({
      granted: z.boolean(),
      method: z.enum(["counter_verbal", "counter_form"]).default("counter_verbal"),
      /* What the customer was actually told, verbatim. Consent is to a
         specific statement, so the statement is stored with it. */
      noticeText: z.string().max(2000).optional(),
      noticeVersion: z.string().max(50).optional()
    })
    .optional()
});

const CUSTOMER_SELECT = `
  id, merchant_id AS "merchantId", name, mobile, pincode, age, location, notes,
  total_spend AS "totalSpend", total_visits AS "totalVisits", last_visit AS "lastVisit",
  whatsapp_opt_in AS "whatsappOptIn",
  consent_state AS "consentState", consent_updated_at AS "consentUpdatedAt",
  created_at AS "createdAt", updated_at AS "updatedAt",
  segment, expected_gap_days AS "expectedGapDays",
  expected_revisit_at AS "expectedRevisitAt", segment_updated_at AS "segmentUpdatedAt"
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
    /* The segment is read here, before the rollup below increments total_visits
       and moves last_visit. FR-A5 shields customers who were Loyal *at the
       moment they returned* — and recording a visit is exactly what makes
       someone look loyal. Reading it after the update would shield nearly every
       return and attribution would never fire. */
    const existing = await client.query<{ id: string; segment: Segment | null }>(
      "SELECT id, segment FROM customers WHERE merchant_id = $1 AND mobile = $2 LIMIT 1",
      [merchantId, mobile]
    );

    let customerId = existing.rows[0]?.id;
    const segmentAtVisit = existing.rows[0]?.segment ?? null;
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

    /* Recorded before the visit so that if anything below fails, no visit
       exists claiming a consent that was never stored — and after the customer
       row exists, because the ledger references it.

       Absence is meaningful here: no `consent` in the request leaves the
       customer `unknown` rather than defaulting to yes. That default is the
       defect being fixed. */
    if (body.consent) {
      await recordConsent(client, {
        merchantId,
        customerId,
        action: body.consent.granted ? "granted" : "withdrawn",
        method: body.consent.method,
        source: "merchant_staff",
        noticeText: body.consent.noticeText ?? null,
        noticeVersion: body.consent.noticeVersion ?? null,
        recordedBy: req.auth!.userId ?? null,
        occurredAt: visitDate
      });
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

    /* FR-A1 — classify this visit organic or influenced. Deliberately before
       the segment recompute below, using the segment captured at the top of
       the transaction. */
    await attributeVisit(client, {
      merchantId,
      customerId,
      visitId,
      visitAt: new Date(visitDate),
      isFirstVisit: isNew,
      segmentAtVisit,
      billingAmount: body.billingAmount
    });

    /* FR-S4 — recompute inside the same transaction as the rollup, so a
       customer's visit count and their segment can never disagree. Runs after
       the visit insert because it reads the visit history that was just
       written, and after attribution because it overwrites the segment that
       attribution needed. */
    await recomputeSegmentForCustomer(client, merchantId, customerId, new Date(visitDate));

    /* Lifecycle enrolment runs last, because the rhythm-based schedule reads
       the expected_gap_days the line above just refreshed. Scheduling before
       the recompute would time this visit's nudges off the previous visit's
       rhythm. */
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

  /* The evidence trail, alongside the customer. A merchant asked "why did she
     stop getting messages" needs the answer on the same screen as the person,
     not in a support ticket. */
  const consents = await getConsentHistory(req.auth!.merchantId, req.params.id);

  return sendSuccess(req, res, { ...item.rows[0], visits: visits.rows, consents });
});

/**
 * Record a consent decision outside the visit flow — defect 7.
 *
 * Separate from PUT /:id on purpose. Consent is not an editable attribute of a
 * customer; it is an event that happened, and the ledger it appends to is
 * append-only. A merchant "correcting" consent the way they correct a spelling
 * is exactly the thing that makes the record worthless.
 */
customersRouter.post("/:id/consent", async (req, res) => {
  const schema = z.object({
    granted: z.boolean(),
    method: z.enum(["counter_verbal", "counter_form", "merchant_import"]),
    noticeText: z.string().max(2000).optional(),
    noticeVersion: z.string().max(50).optional()
  });
  const body = schema.parse(req.body);
  const merchantId = req.auth!.merchantId;

  const existing = await query<{ id: string }>(
    "SELECT id FROM customers WHERE id = $1 AND merchant_id = $2",
    [req.params.id, merchantId]
  );
  if (!existing.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  const record = await withTransaction((client) =>
    recordConsent(client, {
      merchantId,
      customerId: req.params.id,
      action: body.granted ? "granted" : "withdrawn",
      method: body.method,
      source: "merchant_staff",
      noticeText: body.noticeText ?? null,
      noticeVersion: body.noticeVersion ?? null,
      recordedBy: req.auth!.userId ?? null
    })
  );

  const consents = await getConsentHistory(merchantId, req.params.id);
  return sendSuccess(req, res, { recorded: record, consents }, 201);
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
