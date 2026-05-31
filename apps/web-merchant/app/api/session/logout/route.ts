import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function POST() {
  const refreshToken = cookies().get("custva_merchant_refresh_token")?.value;
  if (refreshToken) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
  }
  cookies().delete("custva_merchant_access_token");
  cookies().delete("custva_merchant_refresh_token");
  return NextResponse.json({ success: true });
}
