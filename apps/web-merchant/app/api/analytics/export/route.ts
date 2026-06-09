import { cookies } from "next/headers";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";
const DEV_MERCHANT_ID =
  process.env.CUSTVA_DEV_MERCHANT_ID ?? "00000000-0000-0000-0000-000000000010";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "customers";
  const token = cookies().get("custva_merchant_access_token")?.value;
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : { "x-dev-merchant-id": DEV_MERCHANT_ID };

  const response = await fetch(`${API_BASE}/analytics/export?type=${type}`, {
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    return new Response("Export failed", { status: response.status });
  }

  const csv = await response.text();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${type}-export.csv"`
    }
  });
}
