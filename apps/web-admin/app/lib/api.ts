import { cookies } from "next/headers";
import { adminAuthHeaders } from "./auth-headers";
import { SESSION_COOKIES } from "./session";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function adminApi<T>(path: string): Promise<T> {
  const token = cookies().get(SESSION_COOKIES.access)?.value;
  const headers = adminAuthHeaders(token);

  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers
  });
  if (!response.ok) {
    throw new Error(`Admin API failed (${response.status})`);
  }
  const json = (await response.json()) as { data: T };
  return json.data;
}
