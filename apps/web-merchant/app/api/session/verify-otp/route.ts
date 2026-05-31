import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  verifyOtpCookie,
  hashOtp,
  safeCompareOtp,
  signOtpCookie,
  OTP_MAX_ATTEMPTS_ALLOWED,
} from "../../../lib/otp";

const OTP_COOKIE = "custva_otp_pending";
const ACCESS_COOKIE = "custva_merchant_access_token";
const REFRESH_COOKIE = "custva_merchant_refresh_token";

const IS_PROD = process.env.NODE_ENV === "production";

/** Shared cookie options for session tokens */
const sessionCookieOpts = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "lax" as const,
  path: "/",
};

export async function POST(request: Request) {
  const body = (await request.json()) as { otp: string };

  // 1. Read and verify the pending OTP cookie
  const pendingRaw = cookies().get(OTP_COOKIE)?.value;
  if (!pendingRaw) {
    return NextResponse.json(
      { success: false, message: "OTP session expired or not found. Please log in again." },
      { status: 401 }
    );
  }

  const payload = verifyOtpCookie(pendingRaw);
  if (!payload) {
    // JWT invalid or expired
    cookies().delete(OTP_COOKIE);
    return NextResponse.json(
      { success: false, message: "OTP has expired. Please log in again." },
      { status: 401 }
    );
  }

  // 2. Check attempt count
  if (payload.attempts >= OTP_MAX_ATTEMPTS_ALLOWED) {
    cookies().delete(OTP_COOKIE);
    return NextResponse.json(
      { success: false, message: "Too many incorrect attempts. Please log in again." },
      { status: 429 }
    );
  }

  // 3. Validate the submitted OTP using constant-time comparison
  const submittedHashed = hashOtp(body.otp.trim());
  const isValid = safeCompareOtp(submittedHashed, payload.hashedOtp);

  if (!isValid) {
    const newAttempts = payload.attempts + 1;
    const remaining = OTP_MAX_ATTEMPTS_ALLOWED - newAttempts;

    if (remaining <= 0) {
      // Max attempts reached — nuke the cookie
      cookies().delete(OTP_COOKIE);
      return NextResponse.json(
        { success: false, message: "Too many incorrect attempts. Please log in again." },
        { status: 429 }
      );
    }

    // Re-sign cookie with incremented attempt count
    const updatedToken = signOtpCookie({
      email: payload.email,
      hashedOtp: payload.hashedOtp,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      attempts: newAttempts,
    });

    cookies().set(OTP_COOKIE, updatedToken, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    return NextResponse.json(
      {
        success: false,
        message: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      },
      { status: 401 }
    );
  }

  // 4. OTP is valid — commit the session cookies
  cookies().set(ACCESS_COOKIE, payload.accessToken, {
    ...sessionCookieOpts,
    maxAge: 15 * 60, // 15 minutes (matches JWT_ACCESS_TTL)
  });
  cookies().set(REFRESH_COOKIE, payload.refreshToken, {
    ...sessionCookieOpts,
    maxAge: 30 * 24 * 60 * 60, // 30 days (matches JWT_REFRESH_TTL)
  });

  // 5. Delete the pending OTP cookie (single-use)
  cookies().delete(OTP_COOKIE);

  return NextResponse.json({ success: true });
}
