import { adminProxy } from "../../../../../lib/admin-proxy";

export async function POST(request: Request, context: { params: { id: string } }) {
  const body = await request.json();
  return adminProxy(`/admin/templates/${context.params.id}/push-updates`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}
