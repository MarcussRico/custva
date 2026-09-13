import { Suspense } from "react";
import { MerchantShell } from "../components/MerchantShell";
import { merchantApi } from "../lib/api";
import { CampaignsClient } from "./CampaignsClient";

export default async function CampaignsPage() {
  let campaigns: Array<{
    id: string;
    campaignName: string;
    status: string;
    targetCount: number;
    sentCount?: number;
    deliveredCount?: number;
    dispatch?: Record<string, number> | null;
  }> = [];
  let templates: Array<{ id: string; name: string }> = [];
  let shopName = "Custva Merchant";

  try {
    const shop = await merchantApi<{ shopName: string }>("/merchants/me");
    shopName = shop.shopName;
  } catch {
    // default
  }

  try {
    const data = await merchantApi<{ items: typeof campaigns }>("/campaigns");
    campaigns = data.items;
  } catch {
    campaigns = [];
  }

  try {
    const data = await merchantApi<{ items: Array<{ id: string; name: string }> }>("/templates?limit=100");
    templates = data.items.map((t) => ({ id: t.id, name: t.name }));
  } catch {
    templates = [];
  }

  return (
    <MerchantShell active="campaigns" shopName={shopName}>
      {/* `useSearchParams` inside opts the tree into client rendering. */}
      <Suspense fallback={<p className="merchant-muted">Loading campaigns…</p>}>
        <CampaignsClient campaigns={campaigns} templates={templates} />
      </Suspense>
    </MerchantShell>
  );
}
