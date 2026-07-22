import crypto from "crypto";
import jwt from "jsonwebtoken";
import { requireOtpSecret } from "./auth-headers";

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

function otpSecret() {
  return requireOtpSecret("OTP_JWT_SECRET", "dev-otp-secret-change-in-production");
}

export interface OtpPayload {
  email: string;
  hashedOtp: string;
  accessToken: string;
  refreshToken: string;
  attempts: number;
  iat?: number;
  exp?: number;
}

/** Generate a cryptographically secure 6-digit OTP */
export function generateOtp(): string {
  const n = crypto.randomInt(100000, 1000000);
  return String(n);
}

/** Hash an OTP with SHA-256 so it's never stored in plain text */
export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/**
 * Constant-time comparison of two strings to prevent timing attacks.
 * Both inputs are hashed to ensure equal length before comparison.
 */
export function safeCompareOtp(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/** Sign the OTP pending payload into a JWT cookie value */
export function signOtpCookie(payload: Omit<OtpPayload, "iat" | "exp">): string {
  return jwt.sign(payload, otpSecret(), { expiresIn: OTP_TTL_SECONDS });
}

/** Verify and decode the OTP pending cookie. Returns null if invalid or expired. */
export function verifyOtpCookie(token: string): OtpPayload | null {
  try {
    return jwt.verify(token, otpSecret()) as OtpPayload;
  } catch {
    return null;
  }
}

export const OTP_MAX_ATTEMPTS_ALLOWED = OTP_MAX_ATTEMPTS;
export const OTP_TTL_SECONDS_EXPORT = OTP_TTL_SECONDS;
