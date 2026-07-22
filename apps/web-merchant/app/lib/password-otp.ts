import jwt from "jsonwebtoken";
import { requireOtpSecret } from "./auth-headers";
import { generateOtp, hashOtp, safeCompareOtp, signOtpCookie } from "./otp";

const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;

function otpSecret() {
  return requireOtpSecret("OTP_JWT_SECRET", "dev-otp-secret-change-in-production");
}

export interface PasswordOtpPayload {
  email: string;
  userId: string;
  hashedOtp: string;
  attempts: number;
  iat?: number;
  exp?: number;
}

export function signPasswordOtpCookie(payload: Omit<PasswordOtpPayload, "iat" | "exp">): string {
  return jwt.sign(payload, otpSecret(), { expiresIn: OTP_TTL_SECONDS });
}

export function verifyPasswordOtpCookie(token: string): PasswordOtpPayload | null {
  try {
    return jwt.verify(token, otpSecret()) as PasswordOtpPayload;
  } catch {
    return null;
  }
}

export const PASSWORD_OTP_COOKIE = "custva_pwd_otp_pending";
export const PASSWORD_OTP_MAX_ATTEMPTS = OTP_MAX_ATTEMPTS;

export { generateOtp, hashOtp, safeCompareOtp, signOtpCookie };
