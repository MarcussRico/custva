import { MerchantShell } from "../components/MerchantShell";
import { merchantApi } from "../lib/api";
import { TemplatesClient, type MerchantTemplate } from "./TemplatesClient";

export default async function TemplatesPage() {
  let templates: MerchantTemplate[] = [];
  let shopName = "Custva Merchant";
  try {
    const shop = await merchantApi<{ shopName: string }>("/merchants/me");
    shopName = shop.shopName;
  } catch {
    // default
  }
  try {
    const data = await merchantApi<{ items: MerchantTemplate[] }>("/templates?limit=100");
    templates = data.items;
  } catch {
    templates = [];
  }
  return (
    <MerchantShell active="templates" shopName={shopName}>
      <TemplatesClient templates={templates} />
    </MerchantShell>
  );
}
