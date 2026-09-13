import { merchantProxy } from "../../../lib/merchant-proxy";

/* Dry-run: counts an audience from rules alone, before any campaign exists. */
export async function POST(request: Request) {
  const body = await request.json();
  return merchantProxy("/campaigns/preview-audience", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
