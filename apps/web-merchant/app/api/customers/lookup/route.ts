import { merchantProxy } from "../../../lib/merchant-proxy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  return merchantProxy(`/customers/lookup${qs ? `?${qs}` : ""}`);
}
