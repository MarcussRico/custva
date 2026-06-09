import { merchantProxy } from "../../../lib/merchant-proxy";

export async function GET(_request: Request, context: { params: { id: string } }) {
  return merchantProxy(`/customers/${context.params.id}`);
}

export async function PUT(request: Request, context: { params: { id: string } }) {
  const body = await request.json();
  return merchantProxy(`/customers/${context.params.id}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}
