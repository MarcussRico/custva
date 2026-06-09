import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthPath, isProtectedPath, SESSION_COOKIES } from "./app/lib/session";

function noStoreHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const access = request.cookies.get(SESSION_COOKIES.access)?.value;
  const refresh = request.cookies.get(SESSION_COOKIES.refresh)?.value;
  const hasAccess = Boolean(access);
  const hasRefresh = Boolean(refresh);

  if (isProtectedPath(pathname)) {
    if (!hasAccess && !hasRefresh) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      loginUrl.searchParams.set("reason", "auth_required");
      return NextResponse.redirect(loginUrl);
    }

    if (!hasAccess && hasRefresh) {
      const refreshUrl = new URL("/api/session/refresh-redirect", request.url);
      refreshUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(refreshUrl);
    }

    return noStoreHeaders(NextResponse.next());
  }

  if (isAuthPath(pathname) && hasAccess) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/templates/:path*",
    "/campaigns/:path*",
    "/analytics/:path*",
    "/profile/:path*",
    "/login"
  ]
};
