import { merchantProxy } from "../../../../lib/merchant-proxy";

export async function GET(request: Request, context: { params: { id: string } }) {
  const url = new URL(request.url);
  return merchantProxy(`/campaigns/${context.params.id}/lift?${url.searchParams.toString()}`);
}
