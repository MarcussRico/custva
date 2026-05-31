import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAdminSessionCookies } from "../../../lib/session-cookies";
import { SESSION_COOKIES, SESSION_COOKIE_BASE } from "../../../lib/session";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const refreshToken = cookies().get(SESSION_COOKIES.refresh)?.value;
  if (!refreshToken) {
    clearAdminSessionCookies();
    return NextResponse.redirect(new URL("/login?reason=session_expired", request.url));
  }

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store"
  });

  if (!response.ok) {
    clearAdminSessionCookies();
    return NextResponse.redirect(new URL("/login?reason=session_expired", request.url));
  }

  const data = (await response.json()) as {
    data: { accessToken: string; refreshToken: string };
  };

  const redirect = NextResponse.redirect(new URL(safeNext, request.url));
  redirect.cookies.set(SESSION_COOKIES.access, data.data.accessToken, {
    ...SESSION_COOKIE_BASE,
    maxAge: 15 * 60
  });
  redirect.cookies.set(SESSION_COOKIES.refresh, data.data.refreshToken, {
    ...SESSION_COOKIE_BASE,
    maxAge: 30 * 24 * 60 * 60
  });

  redirect.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
  );

  return redirect;
}
