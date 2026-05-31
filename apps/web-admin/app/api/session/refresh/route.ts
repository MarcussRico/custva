import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearAdminSessionCookies } from "../../../lib/session-cookies";
import { SESSION_COOKIES, SESSION_COOKIE_BASE } from "../../../lib/session";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function POST() {
  const refreshToken = cookies().get(SESSION_COOKIES.refresh)?.value;
  if (!refreshToken) {
    clearAdminSessionCookies();
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store"
  });

  if (!response.ok) {
    clearAdminSessionCookies();
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const data = (await response.json()) as {
    data: { accessToken: string; refreshToken: string };
  };

  cookies().set(SESSION_COOKIES.access, data.data.accessToken, {
    ...SESSION_COOKIE_BASE,
    maxAge: 15 * 60
  });
  cookies().set(SESSION_COOKIES.refresh, data.data.refreshToken, {
    ...SESSION_COOKIE_BASE,
    maxAge: 30 * 24 * 60 * 60
  });

  return NextResponse.json(
    { success: true },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
