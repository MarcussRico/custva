import crypto from "crypto";
import jwt from "jsonwebtoken";
import { requireOtpSecret } from "./auth-headers";

const OTP_JWT_SECRET = requireOtpSecret(
  "ADMIN_OTP_JWT_SECRET",
  "dev-admin-otp-secret-change-in-production"
);
const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;

export interface AdminOtpPayload {
  email: string;
  hashedOtp: string;
  accessToken: string;
  refreshToken: string;
  attempts: number;
  iat?: number;
  exp?: number;
}

/** Cryptographically secure 6-digit OTP — no modulo bias */
export function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

/** One-way SHA-256 hash — raw OTP is never stored */
export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/** Constant-time comparison to prevent timing attacks */
export function safeCompareOtp(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Sign OTP state into a short-lived JWT stored as httpOnly cookie */
export function signOtpCookie(
  payload: Omit<AdminOtpPayload, "iat" | "exp">
): string {
  return jwt.sign(payload, OTP_JWT_SECRET, { expiresIn: OTP_TTL_SECONDS });
}

/** Verify and decode the OTP cookie — returns null if invalid or expired */
export function verifyOtpCookie(token: string): AdminOtpPayload | null {
  try {
    return jwt.verify(token, OTP_JWT_SECRET) as AdminOtpPayload;
  } catch {
    return null;
  }
}
