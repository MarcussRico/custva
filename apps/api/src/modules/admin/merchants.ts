import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { query, withTransaction } from "../../lib/db.js";
import { writeAudit } from "../../lib/audit.js";
import { assignStarterPackToMerchant } from "../../lib/template-service.js";

const PLATFORM_ADMIN_FILTER = `NOT EXISTS (
  SELECT 1 FROM users u WHERE u.merchant_id = m.id AND u.role = 'platform_admin'
)`;

const createMerchantSchema = z.object({
  shopName: z.string().trim().min(2).max(120),
  shopLogo: z.string().trim().max(500_000).optional().or(z.literal("")),
  shopAddress: z.string().trim().min(5).max(500),
  pincode: z.string().trim().regex(/^\d{6}$/, "Pincode must be 6 digits"),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  currentRevenue: z.coerce.number().min(0).max(999_999_999_999)
});

const updateMerchantSchema = z.object({
  shopName: z.string().trim().min(2).max(120).optional(),
  shopLogo: z.string().trim().max(500_000).optional().or(z.literal("")),
  shopAddress: z.string().trim().min(5).max(500).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/).optional(),
  ownerName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).max(128).optional(),
  currentRevenue: z.coerce.number().min(0).max(999_999_999_999).optional(),
  status: z.enum(["active", "suspended", "trial"]).optional()
});

function merchantSelectSql(whereExtra = "") {
  return `SELECT m.id,
            m.business_name AS "shopName",
            m.name AS "ownerName",
            m.email,
            m.status,
            m.logo_url AS "shopLogo",
            m.address AS "shopAddress",
            m.pincode,
            m.current_revenue AS "currentRevenue",
            m.item_categories AS "itemCategories",
            m.created_at AS "createdAt",
            COALESCE(s.status, 'active') AS "subscriptionStatus",
            COALESCE(c.total_customers, 0) AS "totalCustomers"
     FROM merchants m
     LEFT JOIN subscriptions s ON s.merchant_id = m.id
     LEFT JOIN (
       SELECT merchant_id, COUNT(*)::int AS total_customers
       FROM customers GROUP BY merchant_id
     ) c ON c.merchant_id = m.id
     WHERE ${PLATFORM_ADMIN_FILTER} ${whereExtra}`;
}

export const adminMerchantsRouter: Router = Router();

adminMerchantsRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const pincode = typeof req.query.pincode === "string" ? req.query.pincode.trim() : "";

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (q) {
    conditions.push(
      `(m.business_name ILIKE $${paramIdx} OR m.email ILIKE $${paramIdx} OR m.name ILIKE $${paramIdx})`
    );
    params.push(`%${q}%`);
    paramIdx++;
  }
  if (status) {
    conditions.push(`m.status = $${paramIdx}`);
    params.push(status);
    paramIdx++;
  }
  if (pincode) {
    conditions.push(`m.pincode = $${paramIdx}`);
    params.push(pincode);
    paramIdx++;
  }

  const whereExtra =
    conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM merchants m WHERE ${PLATFORM_ADMIN_FILTER} ${whereExtra}`,
    params
  );

  params.push(limit, offset);
  const merchants = await query(
    `${merchantSelectSql(whereExtra)} ORDER BY m.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    params
  );

  return sendSuccess(req, res, {
    items: merchants.rows,
    page,
    limit,
    total: Number(countResult.rows[0].count)
  });
});

adminMerchantsRouter.get("/:id", async (req, res) => {
  const merchants = await query(
    `${merchantSelectSql("AND m.id = $1")} LIMIT 1`,
    [req.params.id]
  );
  if (!merchants.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Merchant not found", 404);
  }
  return sendSuccess(req, res, merchants.rows[0]);
});

adminMerchantsRouter.post("/", async (req, res) => {
  const body = createMerchantSchema.parse(req.body);
  const email = body.email.toLowerCase();
  const itemCategories = ["cafe"];

  const existingMerchant = await query<{ id: string }>(
    "SELECT id FROM merchants WHERE email = $1 LIMIT 1",
    [email]
  );
  if (existingMerchant.rowCount) {
    return sendError(req, res, "CONFLICT", "A merchant with this email already exists", 409);
  }

  const existingUser = await query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  if (existingUser.rowCount) {
    return sendError(req, res, "CONFLICT", "This email is already registered", 409);
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const logoUrl = body.shopLogo?.trim() || null;

  const created = await withTransaction(async (client) => {
    const merchantResult = await client.query<{ id: string }>(
      `INSERT INTO merchants (
         name, business_name, email, status,
         logo_url, address, pincode, current_revenue, item_categories
       )
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        body.ownerName,
        body.shopName,
        email,
        logoUrl,
        body.shopAddress,
        body.pincode,
        body.currentRevenue,
        JSON.stringify(itemCategories)
      ]
    );
    const merchantId = merchantResult.rows[0].id;

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (merchant_id, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'merchant_admin')
       RETURNING id`,
      [merchantId, body.ownerName, email, passwordHash]
    );

    await client.query(
      `INSERT INTO subscriptions (merchant_id, plan_code, status)
       VALUES ($1, 'starter', 'active')`,
      [merchantId]
    );

    const pack = await assignStarterPackToMerchant(client, merchantId);

    return {
      merchantId,
      userId: userResult.rows[0].id,
      templatesAssigned: pack.assigned.length
    };
  });

  await writeAudit(req, "merchant.create", "merchant", created.merchantId, null, {
    shopName: body.shopName,
    email,
    templatesAssigned: created.templatesAssigned
  });

  return sendSuccess(
    req,
    res,
    {
      merchantId: created.merchantId,
      userId: created.userId,
      shopName: body.shopName,
      email,
      templatesAssigned: created.templatesAssigned
    },
    201
  );
});

adminMerchantsRouter.put("/:id", async (req, res) => {
  const body = updateMerchantSchema.parse(req.body);
  const existing = await query(
    `${merchantSelectSql("AND m.id = $1")} LIMIT 1`,
    [req.params.id]
  );
  if (!existing.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Merchant not found", 404);
  }

  const before = existing.rows[0];
  const email = body.email?.toLowerCase();

  if (email && email !== before.email) {
    const clash = await query(
      "SELECT id FROM merchants WHERE email = $1 AND id <> $2 LIMIT 1",
      [email, req.params.id]
    );
    if (clash.rowCount) {
      return sendError(req, res, "CONFLICT", "Email already in use", 409);
    }
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE merchants SET
         name = COALESCE($1, name),
         business_name = COALESCE($2, business_name),
         email = COALESCE($3, email),
         logo_url = COALESCE($4, logo_url),
         address = COALESCE($5, address),
         pincode = COALESCE($6, pincode),
         current_revenue = COALESCE($7, current_revenue),
         status = COALESCE($8, status),
         updated_at = NOW()
       WHERE id = $9`,
      [
        body.ownerName ?? null,
        body.shopName ?? null,
        email ?? null,
        body.shopLogo?.trim() || null,
        body.shopAddress ?? null,
        body.pincode ?? null,
        body.currentRevenue ?? null,
        body.status ?? null,
        req.params.id
      ]
    );

    if (body.password) {
      const hash = await bcrypt.hash(body.password, 10);
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW()
         WHERE merchant_id = $2 AND role = 'merchant_admin'`,
        [hash, req.params.id]
      );
    }

    if (body.ownerName || email) {
      await client.query(
        `UPDATE users SET
           full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           updated_at = NOW()
         WHERE merchant_id = $3 AND role = 'merchant_admin'`,
        [body.ownerName ?? null, email ?? null, req.params.id]
      );
    }
  });

  const updated = await query(
    `${merchantSelectSql("AND m.id = $1")} LIMIT 1`,
    [req.params.id]
  );

  await writeAudit(req, "merchant.update", "merchant", req.params.id, before, updated.rows[0]);

  return sendSuccess(req, res, updated.rows[0]);
});

adminMerchantsRouter.patch("/:id/status", async (req, res) => {
  const schema = z.object({
    status: z.enum(["active", "suspended", "trial"]),
    reason: z.string().optional()
  });
  const body = schema.parse(req.body);

  const before = await query(
    `${merchantSelectSql("AND m.id = $1")} LIMIT 1`,
    [req.params.id]
  );
  if (!before.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Merchant not found", 404);
  }

  await query("UPDATE merchants SET status = $1, updated_at = NOW() WHERE id = $2", [
    body.status,
    req.params.id
  ]);

  await writeAudit(req, "merchant.status", "merchant", req.params.id, before.rows[0], {
    status: body.status,
    reason: body.reason ?? null
  });

  return sendSuccess(req, res, {
    merchantId: req.params.id,
    status: body.status,
    reason: body.reason ?? null
  });
});
