import { cookies } from "next/headers";
import { SESSION_COOKIES, SESSION_COOKIE_BASE } from "./session";

/** Clear all admin session cookies (logout). */
export function clearAdminSessionCookies() {
  const store = cookies();
  for (const name of Object.values(SESSION_COOKIES)) {
    store.set(name, "", { ...SESSION_COOKIE_BASE, maxAge: 0 });
  }
}
