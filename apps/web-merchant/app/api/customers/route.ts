import { merchantProxy } from "../../lib/merchant-proxy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return merchantProxy(`/customers?${url.searchParams.toString()}`);
}

export async function POST(request: Request) {
  const body = await request.json();
  return merchantProxy("/customers", { method: "POST", body: JSON.stringify(body) });
}
