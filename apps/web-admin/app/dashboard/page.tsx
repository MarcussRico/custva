import Link from "next/link";
import { AdminShell } from "../components/AdminShell";
import { adminApi } from "../lib/api";

interface OverviewData {
  totalMerchants: number;
  monthlyRevenue: number;
  activeCampaigns: number;
  totalMessagesSent: number;
  platformCustomerGrowth: number;
}

interface MerchantListData {
  items: Array<{
    id: string;
    shopName: string;
    status: string;
    currentRevenue: number;
    itemCategories: string[];
    totalCustomers: number;
  }>;
}

function formatInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export default async function AdminDashboardPage() {
  let overview: OverviewData = {
    totalMerchants: 0,
    monthlyRevenue: 0,
    activeCampaigns: 0,
    totalMessagesSent: 0,
    platformCustomerGrowth: 0
  };
  let merchants: MerchantListData["items"] = [];

  try {
    overview = await adminApi<OverviewData>("/admin/analytics/overview");
  } catch {
    // Keep defaults when API unavailable.
  }

  try {
    const data = await adminApi<MerchantListData>("/admin/merchants");
    merchants = data.items;
  } catch {
    merchants = [];
  }

  const totalCustomers = merchants.reduce((sum, m) => sum + (m.totalCustomers ?? 0), 0);
  const activeMerchants = merchants.filter((m) => m.status === "active").length;
  const trialMerchants = merchants.filter((m) => m.status === "trial").length;
  const avgRevenue =
    merchants.length > 0
      ? merchants.reduce((sum, m) => sum + Number(m.currentRevenue ?? 0), 0) / merchants.length
      : 0;

  const categoryCounts = new Map<string, number>();
  for (const m of merchants) {
    for (const cat of m.itemCategories ?? []) {
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
  }
  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const kpis = [
    {
      label: "Total Merchants",
      value: formatNumber(overview.totalMerchants),
      hint: `${activeMerchants} active · ${trialMerchants} trial`,
      accent: "blue"
    },
    {
      label: "Platform Revenue",
      value: formatInr(overview.monthlyRevenue),
      hint: "Reported merchant revenue",
      accent: "gold"
    },
    {
      label: "Total Customers",
      value: formatNumber(totalCustomers),
      hint: "Across all merchants",
      accent: "blue"
    },
    {
      label: "Messages Sent",
      value: formatNumber(overview.totalMessagesSent),
      hint: `${formatNumber(overview.activeCampaigns)} active campaigns`,
      accent: "gold"
    }
  ];

  return (
    <AdminShell active="dashboard">
      <header className="dash-header">
        <div>
          <p className="dash-eyebrow">Platform Intelligence</p>
          <h1 className="dash-heading">Analytics</h1>
          <p className="dash-subheading">
            Track merchant growth, revenue, campaigns, and customer engagement.
          </p>
        </div>
        <div className="dash-header-actions">
          <Link href="/merchants" className="dash-btn dash-btn--secondary">
            Manage Merchants
          </Link>
        </div>
      </header>

      <section className="dash-kpi-grid">
        {kpis.map((kpi) => (
          <article key={kpi.label} className={`dash-kpi-card dash-kpi-card--${kpi.accent}`}>
            <p className="dash-kpi-label">{kpi.label}</p>
            <p className="dash-kpi-value">{kpi.value}</p>
            <p className="dash-kpi-hint">{kpi.hint}</p>
          </article>
        ))}
      </section>

      <section className="dash-panels">
        <article className="dash-panel dash-panel--wide">
          <div className="dash-panel-head">
            <h2>Platform Snapshot</h2>
          </div>
          <div className="analytics-stats-grid">
            <div className="analytics-stat">
              <span className="analytics-stat-label">Avg. merchant revenue</span>
              <strong>{formatInr(avgRevenue)}</strong>
            </div>
            <div className="analytics-stat">
              <span className="analytics-stat-label">Active merchants</span>
              <strong>{formatNumber(activeMerchants)}</strong>
            </div>
            <div className="analytics-stat">
              <span className="analytics-stat-label">Trial merchants</span>
              <strong>{formatNumber(trialMerchants)}</strong>
            </div>
            <div className="analytics-stat">
              <span className="analytics-stat-label">Customer growth</span>
              <strong>{overview.platformCustomerGrowth}%</strong>
            </div>
          </div>
        </article>

        <article className="dash-panel">
          <div className="dash-panel-head">
            <h2>Top Categories</h2>
          </div>
          {topCategories.length === 0 ? (
            <p className="dash-empty">No category data yet.</p>
          ) : (
            <ul className="analytics-category-list">
              {topCategories.map(([name, count]) => (
                <li key={name}>
                  <span>{name}</span>
                  <span className="analytics-category-count">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="dash-panels dash-panels--single">
        <article className="dash-panel dash-panel--wide">
          <div className="dash-panel-head">
            <h2>Recent Merchant Activity</h2>
            <Link href="/merchants" className="dash-link">
              View all merchants
            </Link>
          </div>
          {merchants.length === 0 ? (
            <div className="dash-empty-state dash-empty-state--inline">
              <p>No merchant data yet. Add merchants from the Merchants page.</p>
              <Link href="/merchants" className="dash-btn dash-btn--primary">
                Go to Merchants
              </Link>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Shop</th>
                    <th>Categories</th>
                    <th>Revenue</th>
                    <th>Customers</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.slice(0, 8).map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.shopName}</strong>
                      </td>
                      <td>{(m.itemCategories ?? []).slice(0, 2).join(", ")}</td>
                      <td>{formatInr(Number(m.currentRevenue ?? 0))}</td>
                      <td>{formatNumber(m.totalCustomers ?? 0)}</td>
                      <td>
                        <span className={`dash-status dash-status--${m.status}`}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </AdminShell>
  );
}
