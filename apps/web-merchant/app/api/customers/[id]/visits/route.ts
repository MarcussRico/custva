import { merchantProxy } from "../../../../lib/merchant-proxy";

export async function GET(request: Request, context: { params: { id: string } }) {
  const url = new URL(request.url);
  return merchantProxy(`/customers/${context.params.id}/visits?${url.searchParams.toString()}`);
}
