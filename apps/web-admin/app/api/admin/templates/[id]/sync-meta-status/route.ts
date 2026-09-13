import { adminProxy } from "../../../../../lib/admin-proxy";

export async function POST(_request: Request, context: { params: { id: string } }) {
  return adminProxy(`/admin/templates/${context.params.id}/sync-meta-status`, { method: "POST" });
}
