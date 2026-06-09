import { merchantProxy } from "../../../../lib/merchant-proxy";

export async function POST(_request: Request, context: { params: { id: string } }) {
  return merchantProxy(`/campaigns/${context.params.id}/preview-audience`, {
    method: "POST",
    body: "{}"
  });
}
