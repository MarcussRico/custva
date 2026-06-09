import { MerchantShell } from "../../components/MerchantShell";
import { merchantApi } from "../../lib/api";
import { CustomerDetailClient } from "./CustomerDetailClient";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  let shopName = "Custva Merchant";
  try {
    const shop = await merchantApi<{ shopName: string }>("/merchants/me");
    shopName = shop.shopName;
  } catch {
    // default
  }

  return (
    <MerchantShell active="customers" shopName={shopName}>
      <CustomerDetailClient customerId={params.id} />
    </MerchantShell>
  );
}
