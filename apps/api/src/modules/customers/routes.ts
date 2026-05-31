import { Router } from "express";
import { z } from "zod";
import { query } from "../../lib/db.js";
import { sendError, sendSuccess } from "../../lib/api-response.js";

const createCustomerSchema = z.object({
  name: z.string().min(2),
  mobile: z.string().min(8),
  billingAmount: z.number().nonnegative(),
  location: z.string().min(2),
  visitDate: z.string().datetime(),
  notes: z.string().optional()
});

export const customersRouter: Router = Router();

customersRouter.post("/", async (req, res) => {
  const body = createCustomerSchema.parse(req.body);
  const merchantId = req.auth!.merchantId;

  const existing = await query<{ id: string; total_visits: number; total_spend: string }>(
    "SELECT id, total_visits, total_spend FROM customers WHERE merchant_id = $1 AND mobile = $2 LIMIT 1",
    [merchantId, body.mobile]
  );

  let customerId = existing.rows[0]?.id;
  if (!customerId) {
    const inserted = await query<{ id: string }>(
      "INSERT INTO customers (merchant_id, name, mobile, location, notes, total_spend, total_visits, last_visit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [merchantId, body.name, body.mobile, body.location, body.notes ?? null, body.billingAmount, 1, body.visitDate]
    );
    customerId = inserted.rows[0].id;
  } else {
    await query(
      "UPDATE customers SET name=$1, location=$2, notes=$3, total_spend = total_spend + $4, total_visits = total_visits + 1, last_visit=$5, updated_at=NOW() WHERE id=$6 AND merchant_id=$7",
      [body.name, body.location, body.notes ?? null, body.billingAmount, body.visitDate, customerId, merchantId]
    );
  }

  const result = await query(
    "SELECT id, merchant_id AS \"merchantId\", name, mobile, location, notes, total_spend AS \"totalSpend\", total_visits AS \"totalVisits\", last_visit AS \"lastVisit\", created_at AS \"createdAt\", updated_at AS \"updatedAt\" FROM customers WHERE id = $1",
    [customerId]
  );
  return sendSuccess(req, res, result.rows[0], 201);
});

customersRouter.get("/", async (req, res) => {
  const querySchema = z.object({
    page: z.coerce.number().default(1),
    limit: z.coerce.number().default(20),
    q: z.string().optional()
  });
  const parsed = querySchema.parse(req.query);
  const offset = (parsed.page - 1) * parsed.limit;
  const merchantId = req.auth!.merchantId;
  const q = parsed.q ? `%${parsed.q.toLowerCase()}%` : null;

  const items = await query(
    `SELECT id, merchant_id AS "merchantId", name, mobile, location, total_spend AS "totalSpend", total_visits AS "totalVisits", last_visit AS "lastVisit", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM customers
     WHERE merchant_id = $1 AND ($2::text IS NULL OR LOWER(name) LIKE $2 OR mobile LIKE $2)
     ORDER BY updated_at DESC
     LIMIT $3 OFFSET $4`,
    [merchantId, q, parsed.limit, offset]
  );
  const total = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM customers
     WHERE merchant_id = $1 AND ($2::text IS NULL OR LOWER(name) LIKE $2 OR mobile LIKE $2)`,
    [merchantId, q]
  );

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

customersRouter.get("/:id", async (req, res) => {
  const item = await query(
    `SELECT id, merchant_id AS "merchantId", name, mobile, location, notes, total_spend AS "totalSpend", total_visits AS "totalVisits", last_visit AS "lastVisit", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM customers WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!item.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Customer not found", 404);
  }
  return sendSuccess(req, res, item.rows[0]);
});

customersRouter.put("/:id", async (req, res) => {
  const updateSchema = z.object({
    name: z.string().min(2).optional(),
    location: z.string().min(2).optional(),
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
    "UPDATE customers SET name = COALESCE($1, name), location = COALESCE($2, location), notes = COALESCE($3, notes), updated_at = NOW() WHERE id = $4 AND merchant_id = $5",
    [patch.name ?? null, patch.location ?? null, patch.notes ?? null, req.params.id, req.auth!.merchantId]
  );
  const updated = await query(
    `SELECT id, merchant_id AS "merchantId", name, mobile, location, notes, total_spend AS "totalSpend", total_visits AS "totalVisits", last_visit AS "lastVisit", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM customers WHERE id = $1`,
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
