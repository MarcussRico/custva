import { adminProxy } from "../../../lib/admin-proxy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  return adminProxy(`/admin/merchants${qs ? `?${qs}` : ""}`);
}

export async function POST(request: Request) {
  const body = await request.json();
  return adminProxy("/admin/merchants", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
