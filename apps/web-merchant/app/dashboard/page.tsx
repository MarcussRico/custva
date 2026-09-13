import { MerchantShell } from "../components/MerchantShell";
import { merchantApi, merchantApiWithMeta } from "../lib/api";
import { DashboardClient, type RecentCustomer } from "./DashboardClient";
import type { DashboardKpis } from "./DashboardHero";
import type { OverdueCustomer } from "./OverdueNow";

export default async function MerchantDashboardPage() {
  let shopName = "Your Shop";
  let shopLogo: string | null = null;
  let kpis: DashboardKpis = {
    todayVisits: 0,
    todayRevenue: 0,
    todayRepeatRevenue: 0,
    repeatCustomers: 0
  };
  let recentCustomers: RecentCustomer[] = [];
  let overdueCustomers: OverdueCustomer[] = [];
  let overdueTotal = 0;

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
      todayRepeatRevenue: number;
      last30Days?: {
        organicRepeatRevenue: number;
        custvaInfluencedRevenue: number;
        influencedVisits: number;
      };
      overdue?: {
        count: number;
        pastSpend: number;
        contactable: number;
        withRhythm: number;
      };
      consent?: { granted: number; withdrawn: number; unknown: number };
      repeatCustomers: number;
    }>("/analytics/dashboard");
    kpis = {
      todayVisits: stats.todayVisits ?? 0,
      todayRevenue: stats.todayRevenue ?? 0,
      todayRepeatRevenue: stats.todayRepeatRevenue ?? 0,
      last30Days: stats.last30Days,
      overdue: stats.overdue,
      consent: stats.consent,
      repeatCustomers: stats.repeatCustomers ?? 0
    };
  } catch {
    // keep defaults
  }

  /* Sorted most-overdue-first, which is not the list page's default. A
     customer three weeks past a weekly habit has to appear above one who is a
     day past a monthly one. */
  try {
    const { data, meta } = await merchantApiWithMeta<
      { items: OverdueCustomer[] },
      { total?: number }
    >("/customers?overdueOnly=true&sortBy=overdue&limit=6");
    overdueCustomers = data.items;
    overdueTotal = meta.total ?? data.items.length;
  } catch {
    overdueCustomers = [];
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
        shopLogo={shopLogo}
        kpis={kpis}
        overdueCustomers={overdueCustomers}
        overdueTotal={overdueTotal}
        recentCustomers={recentCustomers}
      />
    </MerchantShell>
  );
}
