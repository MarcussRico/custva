import { adminProxy } from "../../../../lib/admin-proxy";

export async function GET(_request: Request, context: { params: { id: string } }) {
  return adminProxy(`/admin/templates/${context.params.id}`);
}

export async function PUT(request: Request, context: { params: { id: string } }) {
  const body = await request.json();
  return adminProxy(`/admin/templates/${context.params.id}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}
