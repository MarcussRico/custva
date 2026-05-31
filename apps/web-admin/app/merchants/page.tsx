import { adminApi } from "../lib/api";
import { AdminShell } from "../components/AdminShell";
import { MerchantsPageClient } from "../components/MerchantsPageClient";

interface MerchantListData {
  items: Array<{
    id: string;
    shopName: string;
    ownerName: string;
    email: string;
    status: string;
    shopLogo: string | null;
    shopAddress: string;
    pincode: string;
    currentRevenue: number;
    itemCategories: string[];
    subscriptionStatus: string;
    totalCustomers?: number;
  }>;
}

export default async function MerchantsPage() {
  let merchants: MerchantListData["items"] = [];
  try {
    const data = await adminApi<MerchantListData>("/admin/merchants");
    merchants = data.items;
  } catch {
    merchants = [];
  }

  return (
    <AdminShell active="merchants">
      <MerchantsPageClient merchants={merchants} />
    </AdminShell>
  );
}
