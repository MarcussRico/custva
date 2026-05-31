import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  verifyOtpCookie,
  hashOtp,
  safeCompareOtp,
  signOtpCookie,
  OTP_MAX_ATTEMPTS,
} from "../../../lib/otp";
import { SESSION_COOKIES, SESSION_COOKIE_BASE } from "../../../lib/session";

export async function POST(request: Request) {
  const body = (await request.json()) as { otp: string };

  const pendingRaw = cookies().get(SESSION_COOKIES.otpPending)?.value;
  if (!pendingRaw) {
    return NextResponse.json(
      { success: false, message: "OTP session expired or not found. Please log in again." },
      { status: 401 }
    );
  }

  const payload = verifyOtpCookie(pendingRaw);
  if (!payload) {
    cookies().set(SESSION_COOKIES.otpPending, "", { ...SESSION_COOKIE_BASE, maxAge: 0 });
    return NextResponse.json(
      { success: false, message: "OTP has expired. Please log in again." },
      { status: 401 }
    );
  }

  if (payload.attempts >= OTP_MAX_ATTEMPTS) {
    cookies().set(SESSION_COOKIES.otpPending, "", { ...SESSION_COOKIE_BASE, maxAge: 0 });
    return NextResponse.json(
      { success: false, message: "Too many incorrect attempts. Please log in again." },
      { status: 429 }
    );
  }

  const submittedHashed = hashOtp(body.otp.trim());
  const isValid = safeCompareOtp(submittedHashed, payload.hashedOtp);

  if (!isValid) {
    const newAttempts = payload.attempts + 1;
    const remaining = OTP_MAX_ATTEMPTS - newAttempts;

    if (remaining <= 0) {
      cookies().set(SESSION_COOKIES.otpPending, "", { ...SESSION_COOKIE_BASE, maxAge: 0 });
      return NextResponse.json(
        { success: false, message: "Too many incorrect attempts. Please log in again." },
        { status: 429 }
      );
    }

    const updated = signOtpCookie({
      email: payload.email,
      hashedOtp: payload.hashedOtp,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      attempts: newAttempts,
    });
    cookies().set(SESSION_COOKIES.otpPending, updated, {
      ...SESSION_COOKIE_BASE,
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

  cookies().set(SESSION_COOKIES.access, payload.accessToken, {
    ...SESSION_COOKIE_BASE,
    maxAge: 15 * 60,
  });
  cookies().set(SESSION_COOKIES.refresh, payload.refreshToken, {
    ...SESSION_COOKIE_BASE,
    maxAge: 30 * 24 * 60 * 60,
  });

  cookies().set(SESSION_COOKIES.otpPending, "", { ...SESSION_COOKIE_BASE, maxAge: 0 });

  return NextResponse.json({ success: true });
}
