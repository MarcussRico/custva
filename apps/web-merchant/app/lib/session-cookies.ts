import { cookies } from "next/headers";
import { SESSION_COOKIES } from "./session";

export function clearMerchantSessionCookies() {
  cookies().delete(SESSION_COOKIES.access);
  cookies().delete(SESSION_COOKIES.refresh);
  cookies().delete(SESSION_COOKIES.otpPending);
}
