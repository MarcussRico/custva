import { merchantProxy } from "../../../lib/merchant-proxy";

export async function POST(_request: Request, context: { params: { id: string } }) {
  return merchantProxy(`/campaigns/${context.params.id}/send`, { method: "POST", body: "{}" });
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const body = await request.json();
  if (body.action === "schedule") {
    return merchantProxy(`/campaigns/${context.params.id}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt: body.scheduledAt })
    });
  }
  if (body.action === "preview") {
    return merchantProxy(`/campaigns/${context.params.id}/preview-audience`, {
      method: "POST",
      body: "{}"
    });
  }
  return merchantProxy(`/campaigns/${context.params.id}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}
