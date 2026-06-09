import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { merchantProxy } from "../../../../../lib/merchant-proxy";
import {
  hashOtp,
  PASSWORD_OTP_COOKIE,
  PASSWORD_OTP_MAX_ATTEMPTS,
  safeCompareOtp,
  signPasswordOtpCookie,
  verifyPasswordOtpCookie
} from "../../../../../lib/password-otp";

export async function POST(request: Request) {
  const body = (await request.json()) as { otp: string; newPassword: string };

  const pendingRaw = cookies().get(PASSWORD_OTP_COOKIE)?.value;
  if (!pendingRaw) {
    return NextResponse.json(
      { success: false, message: "OTP session expired. Request a new code." },
      { status: 401 }
    );
  }

  const payload = verifyPasswordOtpCookie(pendingRaw);
  if (!payload) {
    cookies().delete(PASSWORD_OTP_COOKIE);
    return NextResponse.json(
      { success: false, message: "OTP has expired. Request a new code." },
      { status: 401 }
    );
  }

  if (payload.attempts >= PASSWORD_OTP_MAX_ATTEMPTS) {
    cookies().delete(PASSWORD_OTP_COOKIE);
    return NextResponse.json(
      { success: false, message: "Too many incorrect attempts. Request a new code." },
      { status: 429 }
    );
  }

  const submittedHashed = hashOtp(body.otp.trim());
  const isValid = safeCompareOtp(submittedHashed, payload.hashedOtp);

  if (!isValid) {
    const newAttempts = payload.attempts + 1;
    const remaining = PASSWORD_OTP_MAX_ATTEMPTS - newAttempts;

    if (remaining <= 0) {
      cookies().delete(PASSWORD_OTP_COOKIE);
      return NextResponse.json(
        { success: false, message: "Too many incorrect attempts. Request a new code." },
        { status: 429 }
      );
    }

    cookies().set(
      PASSWORD_OTP_COOKIE,
      signPasswordOtpCookie({
        email: payload.email,
        userId: payload.userId,
        hashedOtp: payload.hashedOtp,
        attempts: newAttempts
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60
      }
    );

    return NextResponse.json(
      {
        success: false,
        message: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
      },
      { status: 401 }
    );
  }

  cookies().delete(PASSWORD_OTP_COOKIE);

  const apiRes = await merchantProxy("/merchants/me/password/confirm", {
    method: "POST",
    body: JSON.stringify({ newPassword: body.newPassword })
  });

  const json = (await apiRes.json()) as { success: boolean; message?: string };
  if (!apiRes.ok || !json.success) {
    return NextResponse.json(
      { success: false, message: json.message ?? "Failed to update password." },
      { status: apiRes.status }
    );
  }

  return NextResponse.json({ success: true });
}
