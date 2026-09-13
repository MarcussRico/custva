import { MerchantShell } from "../components/MerchantShell";
import { merchantApi } from "../lib/api";
import { CommissionClient } from "./CommissionClient";

export default async function BillingPage() {
  let shopName = "Custva Merchant";
  try {
    const shop = await merchantApi<{ shopName: string }>("/merchants/me");
    shopName = shop.shopName;
  } catch {
    // default
  }

  return (
    <MerchantShell active="billing" shopName={shopName}>
      <CommissionClient />
    </MerchantShell>
  );
}
