import { merchantProxy } from "../../../lib/merchant-proxy";

export async function GET(request: Request, context: { params: { path: string[] } }) {
  const url = new URL(request.url);
  const subPath = context.params.path.join("/");
  return merchantProxy(`/analytics/${subPath}?${url.searchParams.toString()}`);
}
