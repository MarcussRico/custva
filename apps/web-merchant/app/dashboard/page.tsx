import Link from "next/link";
import { merchantApi } from "../lib/api";

interface DashboardData {
  totalCustomers: number;
  repeatCustomers: number;
  retentionRate: number;
  revenueFromCampaigns: number;
}

function formatInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

export default async function MerchantDashboardPage() {
  let dashboard: DashboardData = {
    totalCustomers: 0,
    repeatCustomers: 0,
    retentionRate: 0,
    revenueFromCampaigns: 0
  };
  try {
    dashboard = await merchantApi<DashboardData>("/analytics/dashboard");
  } catch {
    // Fallback keeps dashboard renderable if API is down.
  }

  const kpis = [
    { label: "Total Customers", value: String(dashboard.totalCustomers) },
    { label: "Repeat Customers", value: String(dashboard.repeatCustomers) },
    { label: "Retention Rate", value: `${dashboard.retentionRate}%` },
    { label: "Revenue From Campaigns", value: formatInr(dashboard.revenueFromCampaigns) }
  ];

  return (
    <main className="merchant-shell">
      <header className="merchant-header">
        <div>
          <h1>Custva Merchant Dashboard</h1>
          <p>Retention operating system for your store.</p>
        </div>
        <span className="badge">Live</span>
      </header>

      <section className="merchant-kpis">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="kpi-card">
            <p>{kpi.label}</p>
            <p className="kpi-value">{kpi.value}</p>
          </article>
        ))}
      </section>

      <section className="campaign-panel">
        <h2>Campaign Command Center</h2>
        <p>Create WhatsApp campaigns using audience filters and schedule automated sends.</p>
        <p>
          Current focus: customers with spend greater than ₹500 and inactive for 15+ days.
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          <Link href="/customers">Customers</Link> | <Link href="/campaigns">Campaigns</Link> |{" "}
          <Link href="/analytics">Analytics</Link>
        </p>
      </section>
    </main>
  );
}
