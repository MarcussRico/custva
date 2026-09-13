import { merchantProxy } from "../../../../lib/merchant-proxy";

/* Append-only by design: there is no PUT or DELETE here, because a consent
   history a merchant can edit is not evidence of anything. */
export async function POST(request: Request, context: { params: { id: string } }) {
  const body = await request.json();
  return merchantProxy(`/customers/${context.params.id}/consent`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}
