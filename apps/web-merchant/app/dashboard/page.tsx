import { MerchantShell } from "../components/MerchantShell";
import { merchantApi } from "../lib/api";
import { DashboardClient, type RecentCustomer } from "./DashboardClient";
import type { DashboardKpis } from "./DashboardHero";

export default async function MerchantDashboardPage() {
  let shopName = "Your Shop";
  let shopLogo: string | null = null;
  let kpis: DashboardKpis = {
    todayVisits: 0,
    todayRevenue: 0,
    todayRetentionRevenue: 0,
    repeatCustomers: 0
  };
  let recentCustomers: RecentCustomer[] = [];

  try {
    const shop = await merchantApi<{
      shopName: string;
      shopLogo: string | null;
    }>("/merchants/me");
    shopName = shop.shopName;
    shopLogo = shop.shopLogo;
  } catch {
    // keep defaults
  }

  try {
    const stats = await merchantApi<{
      todayVisits: number;
      todayRevenue: number;
      todayRetentionRevenue: number;
      repeatCustomers: number;
    }>("/analytics/dashboard");
    kpis = {
      todayVisits: stats.todayVisits ?? 0,
      todayRevenue: stats.todayRevenue ?? 0,
      todayRetentionRevenue: stats.todayRetentionRevenue ?? 0,
      repeatCustomers: stats.repeatCustomers ?? 0
    };
  } catch {
    // keep defaults
  }

  try {
    const data = await merchantApi<{ items: RecentCustomer[] }>("/customers/recent");
    recentCustomers = data.items;
  } catch {
    recentCustomers = [];
  }

  return (
    <MerchantShell active="dashboard" shopName={shopName}>
      <DashboardClient
        shopName={shopName}
        shopLogo={shopLogo}
        kpis={kpis}
        recentCustomers={recentCustomers}
      />
    </MerchantShell>
  );
}
