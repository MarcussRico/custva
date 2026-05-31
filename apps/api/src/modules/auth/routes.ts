import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { env } from "../../config.js";
import { query } from "../../lib/db.js";

const registerSchema = z.object({
  businessName: z.string().min(2),
  merchantName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  mobile: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(16)
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const authRouter: Router = Router();

authRouter.post("/register", async (req, res) => {
  const body = registerSchema.parse(req.body);
  const existing = await query<{ id: string }>(
    "SELECT id FROM merchants WHERE email = $1 LIMIT 1",
    [body.email]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return sendError(req, res, "CONFLICT", "Merchant with this email already exists", 409);
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const merchantResult = await query<{ id: string }>(
    "INSERT INTO merchants (name, business_name, email, status) VALUES ($1, $2, $3, $4) RETURNING id",
    [body.merchantName, body.businessName, body.email, "trial"]
  );
  const merchantId = merchantResult.rows[0].id;

  const userResult = await query<{ id: string }>(
    "INSERT INTO users (merchant_id, full_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [merchantId, body.merchantName, body.email, passwordHash, "merchant_admin"]
  );

  return sendSuccess(req, res, {
    merchantId,
    userId: userResult.rows[0].id,
    verificationRequired: true,
    businessName: body.businessName
  }, 201);
});

authRouter.post("/login", async (req, res) => {
  const body = loginSchema.parse(req.body);
  const userResult = await query<{
    id: string;
    merchant_id: string;
    role: "merchant_admin" | "merchant_staff" | "platform_admin";
    password_hash: string;
    email: string;
  }>(
    "SELECT id, merchant_id, role, password_hash, email FROM users WHERE email = $1 AND is_active = true LIMIT 1",
    [body.email]
  );
  if (!userResult.rowCount) {
    return sendError(req, res, "AUTH_INVALID_CREDENTIALS", "Invalid credentials", 401);
  }
  const user = userResult.rows[0];
  const ok = await bcrypt.compare(body.password, user.password_hash);
  if (!ok) {
    return sendError(req, res, "AUTH_INVALID_CREDENTIALS", "Invalid credentials", 401);
  }

  const accessToken = jwt.sign(
    { sub: user.id, merchantId: user.merchant_id, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );
  const refreshToken = jwt.sign(
    { sub: user.id, merchantId: user.merchant_id, role: user.role, type: "refresh" },
    env.JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await query(
    "INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [user.id, refreshTokenHash, expiresAt]
  );

  return sendSuccess(req, res, {
    accessToken,
    refreshToken,
    expiresIn: 900,
    user: {
      id: user.id,
      merchantId: user.merchant_id,
      role: user.role,
      email: user.email
    }
  });
});

authRouter.post("/forgot-password", (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const body = schema.parse(req.body);
  return sendSuccess(req, res, {
    sent: true,
    email: body.email
  });
});

authRouter.post("/reset-password", (req, res) => {
  const schema = z.object({
    token: z.string().min(8),
    newPassword: z.string().min(8)
  });
  schema.parse(req.body);
  return sendSuccess(req, res, { updated: true });
});

authRouter.post("/refresh", async (req, res) => {
  const body = refreshSchema.parse(req.body);
  const tokenHash = hashToken(body.refreshToken);
  const tokenRow = await query<{ user_id: string; revoked_at: string | null; expires_at: string }>(
    "SELECT user_id, revoked_at, expires_at FROM auth_refresh_tokens WHERE token_hash = $1 LIMIT 1",
    [tokenHash]
  );
  if (!tokenRow.rowCount) {
    return sendError(req, res, "AUTH_FORBIDDEN", "Refresh token not recognized", 401);
  }
  const tokenRecord = tokenRow.rows[0];
  if (tokenRecord.revoked_at) {
    return sendError(req, res, "AUTH_FORBIDDEN", "Refresh token revoked", 401);
  }
  if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
    return sendError(req, res, "AUTH_TOKEN_EXPIRED", "Refresh token expired", 401);
  }

  const decoded = jwt.verify(body.refreshToken, env.JWT_REFRESH_SECRET) as {
    sub: string;
    merchantId: string;
    role: "merchant_admin" | "merchant_staff" | "platform_admin";
  };

  const accessToken = jwt.sign(
    { sub: decoded.sub, merchantId: decoded.merchantId, role: decoded.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );
  const newRefreshToken = jwt.sign(
    {
      sub: decoded.sub,
      merchantId: decoded.merchantId,
      role: decoded.role,
      type: "refresh"
    },
    env.JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );

  await query("UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1", [tokenHash]);
  await query(
    "INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [
      decoded.sub,
      hashToken(newRefreshToken),
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    ]
  );

  return sendSuccess(req, res, {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 900
  });
});

authRouter.post("/logout", async (req, res) => {
  const body = refreshSchema.parse(req.body);
  const tokenHash = hashToken(body.refreshToken);
  await query("UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1", [tokenHash]);
  return sendSuccess(req, res, { loggedOut: true });
});
