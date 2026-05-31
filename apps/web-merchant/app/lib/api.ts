import { cookies } from "next/headers";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";
const DEV_MERCHANT_ID =
  process.env.CUSTVA_DEV_MERCHANT_ID ?? "00000000-0000-0000-0000-000000000010";

export async function merchantApi<T>(path: string): Promise<T> {
  const token = cookies().get("custva_merchant_access_token")?.value;
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : { "x-dev-merchant-id": DEV_MERCHANT_ID };

  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers
  });
  if (!response.ok) {
    throw new Error(`Merchant API failed (${response.status})`);
  }
  const json = (await response.json()) as { data: T };
  return json.data;
}
