import { adminProxy } from "../../../../../lib/admin-proxy";

export async function GET(_request: Request, context: { params: { id: string } }) {
  return adminProxy(`/admin/templates/${context.params.id}/assignments`);
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const body = await request.json();
  return adminProxy(`/admin/templates/${context.params.id}/assign`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}
