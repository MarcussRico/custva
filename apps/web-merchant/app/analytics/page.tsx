import { MerchantShell } from "../components/MerchantShell";
import { merchantApi } from "../lib/api";
import { AnalyticsClient } from "./AnalyticsClient";

export default async function AnalyticsPage() {
  let shopName = "Custva Merchant";
  let dashboard = {
    totalCustomers: 0,
    repeatCustomers: 0,
    retentionRate: 0,
    customerGrowth: 0,
    totalRevenue: 0,
    series: [] as Array<{ date: string; visits: number; revenue: number; newCustomers: number }>
  };
  let customers = {
    topCustomers: [] as Array<{ name: string; totalSpend: number }>,
    inactiveBuckets: { active7d: 0, active30d: 0, inactive: 0 },
    newVsRepeat: { newCustomers: 0, repeatCustomers: 0 }
  };
  let segments = { byPincode: [] as Array<{ pincode: string; count: number }>, byAge: [] as Array<{ band: string; count: number }> };
  let campaigns: Array<{ campaignName: string; sentCount: number; deliveredCount: number; failedCount: number }> = [];

  try {
    const shop = await merchantApi<{ shopName: string }>("/merchants/me");
    shopName = shop.shopName;
  } catch {
    // default
  }

  try { dashboard = await merchantApi<typeof dashboard>("/analytics/dashboard"); } catch { /* */ }
  try { customers = await merchantApi<typeof customers>("/analytics/customers"); } catch { /* */ }
  try { segments = await merchantApi<typeof segments>("/analytics/segments"); } catch { /* */ }
  try {
    const data = await merchantApi<{ items: typeof campaigns }>("/analytics/campaigns");
    campaigns = data.items;
  } catch {
    campaigns = [];
  }

  return (
    <MerchantShell active="analytics" shopName={shopName}>
      <AnalyticsClient dashboard={dashboard} customers={customers} segments={segments} campaigns={campaigns} />
    </MerchantShell>
  );
}
