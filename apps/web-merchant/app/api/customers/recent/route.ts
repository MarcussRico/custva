import { merchantProxy } from "../../../lib/merchant-proxy";

export async function GET() {
  return merchantProxy("/customers/recent");
}
