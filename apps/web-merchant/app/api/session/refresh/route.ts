import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function POST() {
  const refreshToken = cookies().get("custva_merchant_refresh_token")?.value;
  if (!refreshToken) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  if (!response.ok) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  const data = (await response.json()) as {
    data: { accessToken: string; refreshToken: string };
  };
  cookies().set("custva_merchant_access_token", data.data.accessToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/"
  });
  cookies().set("custva_merchant_refresh_token", data.data.refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/"
  });
  return NextResponse.json({ success: true });
}
