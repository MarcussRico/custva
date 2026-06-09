import { MerchantShell } from "../components/MerchantShell";
import { merchantApi } from "../lib/api";
import { CustomersPageClient } from "./CustomersPageClient";

export default async function CustomersPage() {
  let shopName = "Custva Merchant";
  try {
    const shop = await merchantApi<{ shopName: string }>("/merchants/me");
    shopName = shop.shopName;
  } catch {
    // default
  }

  return (
    <MerchantShell active="customers" shopName={shopName}>
      <CustomersPageClient />
    </MerchantShell>
  );
}
