import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { requireRole } from "../../middleware/auth.js";
import { query, withTransaction } from "../../lib/db.js";

export const adminRouter: Router = Router();

adminRouter.use(requireRole(["platform_admin"]));

const createMerchantSchema = z.object({
  shopName: z.string().trim().min(2).max(120),
  shopLogo: z.string().trim().max(500_000).optional().or(z.literal("")),
  shopAddress: z.string().trim().min(5).max(500),
  pincode: z.string().trim().regex(/^\d{6}$/, "Pincode must be 6 digits"),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  currentRevenue: z.coerce.number().min(0).max(999_999_999_999),
  itemCategories: z.array(z.string().trim().min(1).max(60)).min(1).max(20)
});

adminRouter.get("/merchants", async (req, res) => {
  const merchants = await query(
    `SELECT m.id,
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
            COALESCE(s.status, 'trialing') AS "subscriptionStatus",
            COALESCE(c.total_customers, 0) AS "totalCustomers"
     FROM merchants m
     LEFT JOIN subscriptions s ON s.merchant_id = m.id
     LEFT JOIN (
       SELECT merchant_id, COUNT(*)::int AS total_customers
       FROM customers GROUP BY merchant_id
     ) c ON c.merchant_id = m.id
     WHERE NOT EXISTS (
       SELECT 1 FROM users u
       WHERE u.merchant_id = m.id AND u.role = 'platform_admin'
     )
     ORDER BY m.created_at DESC`
  );
  return sendSuccess(req, res, {
    items: merchants.rows
  });
});

adminRouter.post("/merchants", async (req, res) => {
  const body = createMerchantSchema.parse(req.body);
  const email = body.email.toLowerCase();

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
  const categoriesJson = JSON.stringify(body.itemCategories);

  const created = await withTransaction(async (client) => {
    const merchantResult = await client.query<{ id: string }>(
      `INSERT INTO merchants (
         name, business_name, email, status,
         logo_url, address, pincode, current_revenue, item_categories
       )
       VALUES ($1, $2, $3, 'trial', $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        body.ownerName,
        body.shopName,
        email,
        logoUrl,
        body.shopAddress,
        body.pincode,
        body.currentRevenue,
        categoriesJson
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
       VALUES ($1, 'starter', 'trialing')`,
      [merchantId]
    );

    return {
      merchantId,
      userId: userResult.rows[0].id
    };
  });

  return sendSuccess(
    req,
    res,
    {
      merchantId: created.merchantId,
      userId: created.userId,
      shopName: body.shopName,
      email
    },
    201
  );
});

adminRouter.patch("/merchants/:id/status", async (req, res) => {
  const schema = z.object({
    status: z.enum(["active", "suspended", "trial"]),
    reason: z.string().optional()
  });
  const body = schema.parse(req.body);
  await query("UPDATE merchants SET status = $1, updated_at = NOW() WHERE id = $2", [
    body.status,
    req.params.id
  ]);
  return sendSuccess(req, res, {
    merchantId: req.params.id,
    status: body.status,
    reason: body.reason ?? null
  });
});

adminRouter.get("/analytics/overview", async (req, res) => {
  const merchants = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM merchants m
     WHERE NOT EXISTS (
       SELECT 1 FROM users u
       WHERE u.merchant_id = m.id AND u.role = 'platform_admin'
     )`
  );
  const activeCampaigns = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM campaigns WHERE status IN ('scheduled','sending')"
  );
  const messages = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM messages");
  const revenue = await query<{ total: string }>(
    `SELECT COALESCE(SUM(current_revenue), 0)::text AS total
     FROM merchants m
     WHERE NOT EXISTS (
       SELECT 1 FROM users u
       WHERE u.merchant_id = m.id AND u.role = 'platform_admin'
     )`
  );
  return sendSuccess(req, res, {
    totalMerchants: Number(merchants.rows[0].count),
    monthlyRevenue: Number(revenue.rows[0].total),
    activeCampaigns: Number(activeCampaigns.rows[0].count),
    totalMessagesSent: Number(messages.rows[0].count),
    platformCustomerGrowth: 0
  });
});
