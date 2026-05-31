import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateOtp, hashOtp, signOtpCookie } from "../../../lib/otp";
import { sendAdminOtpEmail } from "../../../lib/mailer";
import { SESSION_COOKIES, SESSION_COOKIE_BASE } from "../../../lib/session";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function POST(request: Request) {
  const body = (await request.json()) as { email: string; password: string };
  const email = body.email.toLowerCase().trim();

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: body.password }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return NextResponse.json(
      {
        success: false,
        message: err?.error?.message ?? "Invalid credentials.",
      },
      { status: response.status === 401 ? 401 : 502 }
    );
  }

  const data = (await response.json()) as {
    data: {
      accessToken: string;
      refreshToken: string;
      user: { role: string };
    };
  };

  // ── 3. Enforce role: only platform_admin may proceed ──────────────────────
  if (data.data.user.role !== "platform_admin") {
    return NextResponse.json(
      { success: false, message: "Admin access only." },
      { status: 403 }
    );
  }

  // ── 4. Generate OTP ────────────────────────────────────────────────────────
  const otp = generateOtp();
  const hashedOtp = hashOtp(otp);

  // ── 5. Sign pending cookie (hashed OTP + tokens, NOT the plain OTP) ───────
  const pendingToken = signOtpCookie({
    email,
    hashedOtp,
    accessToken: data.data.accessToken,
    refreshToken: data.data.refreshToken,
    attempts: 0,
  });

  cookies().set(SESSION_COOKIES.otpPending, pendingToken, {
    ...SESSION_COOKIE_BASE,
    maxAge: 10 * 60,
  });

  // ── 6. Email the OTP ───────────────────────────────────────────────────────
  try {
    await sendAdminOtpEmail(email, otp);
  } catch (err) {
    console.error("[AdminOTP] Failed to send OTP email:", err);
    cookies().set(SESSION_COOKIES.otpPending, "", { ...SESSION_COOKIE_BASE, maxAge: 0 });
    return NextResponse.json(
      { success: false, message: "Failed to send OTP email. Please try again." },
      { status: 500 }
    );
  }

  // Do NOT set session cookies yet — only after OTP verification
  return NextResponse.json({ success: true, requiresOtp: true });
}
