import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateOtp, hashOtp, signOtpCookie } from "../../../lib/otp";
import { sendOtpEmail } from "../../../lib/mailer";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function POST(request: Request) {
  const body = (await request.json()) as { email: string; password: string };

  // Step 1: Validate credentials against the backend
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return NextResponse.json(
      { success: false, message: "Invalid email or password." },
      { status: 401 }
    );
  }

  const data = (await response.json()) as {
    data: { accessToken: string; refreshToken: string };
  };

  // Step 2: Generate OTP
  const otp = generateOtp();
  const hashedOtp = hashOtp(otp);

  // Step 3: Sign the pending cookie (stores hashed OTP + tokens, but NOT the plain OTP)
  const pendingToken = signOtpCookie({
    email: body.email,
    hashedOtp,
    accessToken: data.data.accessToken,
    refreshToken: data.data.refreshToken,
    attempts: 0,
  });

  // Step 4: Set the pending cookie — httpOnly so JS cannot read it
  cookies().set("custva_otp_pending", pendingToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  // Step 5: Send OTP email (fire — any error is surfaced to the client)
  try {
    await sendOtpEmail(body.email, otp);
  } catch (err) {
    console.error("[OTP] Failed to send OTP email:", err);
    // Clear the pending cookie so the user can retry
    cookies().delete("custva_otp_pending");
    return NextResponse.json(
      { success: false, message: "Failed to send OTP email. Please try again." },
      { status: 500 }
    );
  }

  // Do NOT set session tokens yet — that happens after OTP is verified
  return NextResponse.json({ success: true, requiresOtp: true });
}
