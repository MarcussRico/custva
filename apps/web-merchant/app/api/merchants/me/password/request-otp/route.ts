import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { merchantProxy } from "../../../../../lib/merchant-proxy";
import {
  generateOtp,
  hashOtp,
  PASSWORD_OTP_COOKIE,
  signPasswordOtpCookie
} from "../../../../../lib/password-otp";
import { sendOtpEmail } from "../../../../../lib/mailer";
import { SESSION_COOKIES } from "../../../../../lib/session";

export async function POST() {
  const token = cookies().get(SESSION_COOKIES.access)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const meRes = await merchantProxy("/merchants/me");
  const meJson = (await meRes.json()) as {
    success: boolean;
    data?: { email: string };
    message?: string;
  };
  if (!meRes.ok || !meJson.success || !meJson.data?.email) {
    return NextResponse.json(
      { success: false, message: meJson.message ?? "Could not load merchant profile." },
      { status: meRes.status }
    );
  }

  await merchantProxy("/merchants/me/password/request-otp", { method: "POST", body: "{}" });

  const email = meJson.data.email;
  const otp = generateOtp();
  const hashedOtp = hashOtp(otp);

  const pendingToken = signPasswordOtpCookie({
    email,
    userId: "",
    hashedOtp,
    attempts: 0
  });

  cookies().set(PASSWORD_OTP_COOKIE, pendingToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60
  });

  try {
    await sendOtpEmail(email, otp);
  } catch (err) {
    console.error("[Password OTP] Failed to send email:", err);
    cookies().delete(PASSWORD_OTP_COOKIE);
    return NextResponse.json(
      { success: false, message: "Failed to send OTP email. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, email: email.replace(/(.{2}).+(@.+)/, "$1***$2") });
}
