import { cookies } from "next/headers";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";
const DEV_MERCHANT_ID =
  process.env.CUSTVA_DEV_MERCHANT_ID ?? "00000000-0000-0000-0000-000000000010";

function authHeaders(): Record<string, string> {
  const token = cookies().get("custva_merchant_access_token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : { "x-dev-merchant-id": DEV_MERCHANT_ID };
}

export async function merchantApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: authHeaders()
  });
  if (!response.ok) {
    throw new Error(`Merchant API failed (${response.status})`);
  }
  const json = (await response.json()) as { data: T };
  return json.data;
}

export async function merchantFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init.headers as Record<string, string>)
    },
    cache: "no-store"
  });
}
