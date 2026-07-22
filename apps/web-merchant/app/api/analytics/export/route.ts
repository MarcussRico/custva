import { cookies } from "next/headers";
import { merchantAuthHeaders } from "../../../lib/auth-headers";

const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "customers";
  const token = cookies().get("custva_merchant_access_token")?.value;
  const headers = merchantAuthHeaders(token);

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
