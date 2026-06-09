import { merchantProxy } from "../../../lib/merchant-proxy";

export async function GET() {
  return merchantProxy("/merchants/me");
}

export async function PATCH(request: Request) {
  const body = await request.json();
  return merchantProxy("/merchants/me", { method: "PATCH", body: JSON.stringify(body) });
}
