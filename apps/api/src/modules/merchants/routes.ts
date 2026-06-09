import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { query } from "../../lib/db.js";
import { requireRole } from "../../middleware/auth.js";

const patchMerchantSchema = z.object({
  shopName: z.string().trim().min(2).max(120).optional(),
  ownerName: z.string().trim().min(2).max(120).optional(),
  shopAddress: z.string().trim().min(2).max(500).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  shopLogo: z.string().optional(),
  email: z.string().email().optional(),
  currentRevenue: z.number().nonnegative().optional()
});

export const merchantsRouter: Router = Router();

merchantsRouter.use(requireRole(["merchant_admin", "merchant_staff"]));

merchantsRouter.get("/me", async (req, res) => {
  const merchantId = req.auth!.merchantId;
  const row = await query(
    `SELECT m.id,
            m.business_name AS "shopName",
            m.name AS "ownerName",
            m.email,
            m.logo_url AS "shopLogo",
            m.address AS "shopAddress",
            m.pincode,
            m.current_revenue AS "currentRevenue",
            m.item_categories AS "itemCategories",
            m.status,
            s.status AS "subscriptionStatus",
            s.plan_code AS "planCode"
     FROM merchants m
     LEFT JOIN subscriptions s ON s.merchant_id = m.id AND s.status = 'active'
     WHERE m.id = $1
     LIMIT 1`,
    [merchantId]
  );
  if (!row.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Merchant not found", 404);
  }
  return sendSuccess(req, res, row.rows[0]);
});

merchantsRouter.patch("/me", async (req, res) => {
  const body = patchMerchantSchema.parse(req.body);
  const merchantId = req.auth!.merchantId;
  const userId = req.auth!.userId;

  const before = await query(
    `SELECT business_name, name, email, logo_url, address, pincode, current_revenue
     FROM merchants WHERE id = $1`,
    [merchantId]
  );
  if (!before.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Merchant not found", 404);
  }

  const emailChanging = body.email && body.email.toLowerCase() !== String(before.rows[0].email).toLowerCase();

  if (emailChanging) {
    const taken = await query(
      `SELECT id FROM merchants WHERE email = $1 AND id != $2`,
      [body.email!.toLowerCase(), merchantId]
    );
    if (taken.rowCount) {
      return sendError(req, res, "CONFLICT", "Email already in use", 409);
    }
  }

  await query(
    `UPDATE merchants SET
       business_name = COALESCE($1, business_name),
       name = COALESCE($2, name),
       logo_url = COALESCE($3, logo_url),
       address = COALESCE($4, address),
       pincode = COALESCE($5, pincode),
       current_revenue = COALESCE($6, current_revenue),
       email = COALESCE($7, email),
       updated_at = NOW()
     WHERE id = $8`,
    [
      body.shopName ?? null,
      body.ownerName ?? null,
      body.shopLogo ?? null,
      body.shopAddress ?? null,
      body.pincode ?? null,
      body.currentRevenue ?? null,
      body.email?.toLowerCase() ?? null,
      merchantId
    ]
  );

  if (body.ownerName || body.email) {
    await query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         email = COALESCE($2, email),
         updated_at = NOW()
       WHERE id = $3 AND merchant_id = $4`,
      [body.ownerName ?? null, body.email?.toLowerCase() ?? null, userId, merchantId]
    );
  }

  const updated = await query(
    `SELECT m.id,
            m.business_name AS "shopName",
            m.name AS "ownerName",
            m.email,
            m.logo_url AS "shopLogo",
            m.address AS "shopAddress",
            m.pincode,
            m.current_revenue AS "currentRevenue",
            m.item_categories AS "itemCategories",
            m.status,
            s.status AS "subscriptionStatus"
     FROM merchants m
     LEFT JOIN subscriptions s ON s.merchant_id = m.id AND s.status = 'active'
     WHERE m.id = $1`,
    [merchantId]
  );

  return sendSuccess(req, res, {
    ...updated.rows[0],
    emailVerificationRequired: emailChanging
  });
});

const passwordConfirmSchema = z.object({
  newPassword: z.string().min(8).max(128)
});

merchantsRouter.post("/me/password/request-otp", requireRole(["merchant_admin"]), async (req, res) => {
  const row = await query<{ email: string }>(
    "SELECT email FROM merchants WHERE id = $1 LIMIT 1",
    [req.auth!.merchantId]
  );
  if (!row.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Merchant not found", 404);
  }
  const email = row.rows[0].email;
  const masked = email.replace(/(.{2}).+(@.+)/, "$1***$2");
  return sendSuccess(req, res, { sent: true, email: masked });
});

merchantsRouter.post("/me/password/confirm", requireRole(["merchant_admin"]), async (req, res) => {
  const body = passwordConfirmSchema.parse(req.body);
  const userId = req.auth!.userId;

  const hash = await bcrypt.hash(body.newPassword, 10);
  await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW()
     WHERE id = $2 AND merchant_id = $3 AND role = 'merchant_admin'`,
    [hash, userId, req.auth!.merchantId]
  );

  return sendSuccess(req, res, { updated: true });
});
