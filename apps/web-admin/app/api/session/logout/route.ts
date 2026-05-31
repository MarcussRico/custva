import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearAdminSessionCookies } from "../../../lib/session-cookies";
import { SESSION_COOKIES } from "../../../lib/session";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function POST() {
  const refreshToken = cookies().get(SESSION_COOKIES.refresh)?.value;

  if (refreshToken) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store"
      });
    } catch {
      // Still clear local session even if backend revoke fails.
    }
  }

  clearAdminSessionCookies();

  return NextResponse.json(
    { success: true, redirectTo: "/login?reason=logged_out" },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache"
      }
    }
  );
}

/** GET logout — hard redirect for direct links / back-button recovery */
export async function GET(request: Request) {
  const refreshToken = cookies().get(SESSION_COOKIES.refresh)?.value;

  if (refreshToken) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store"
      });
    } catch {
      // ignore
    }
  }

  clearAdminSessionCookies();

  const response = NextResponse.redirect(new URL("/login?reason=logged_out", request.url));
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
  );
  return response;
}
