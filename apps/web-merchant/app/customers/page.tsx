import { Suspense } from "react";
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
      {/* `useSearchParams` inside opts the tree into client rendering; without
          a boundary the build fails on the prerender pass. */}
      <Suspense fallback={<p className="merchant-muted">Loading customers…</p>}>
        <CustomersPageClient />
      </Suspense>
    </MerchantShell>
  );
}
