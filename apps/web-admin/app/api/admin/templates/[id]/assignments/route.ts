import { adminProxy } from "../../../../../lib/admin-proxy";

export async function GET(_request: Request, context: { params: { id: string } }) {
  return adminProxy(`/admin/templates/${context.params.id}/assignments`);
}
