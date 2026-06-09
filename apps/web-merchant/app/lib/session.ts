export const SESSION_COOKIES = {
  access: "custva_merchant_access_token",
  refresh: "custva_merchant_refresh_token",
  otpPending: "custva_otp_pending"
} as const;

export const PROTECTED_ROUTES = [
  "/dashboard",
  "/customers",
  "/templates",
  "/campaigns",
  "/analytics",
  "/profile"
] as const;

export const AUTH_ROUTES = ["/login"] as const;

export function isProtectedPath(pathname: string) {
  return PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function isAuthPath(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname === route);
}

export const SESSION_COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
};
