export interface DashboardKpis {
  todayVisits: number;
  todayRevenue: number;
  todayRetentionRevenue: number;
  repeatCustomers: number;
}

export function DashboardHero({
  shopName,
  shopLogo,
  kpis
}: {
  shopName: string;
  shopLogo: string | null;
  kpis: DashboardKpis;
}) {
  return (
    <section className="merchant-hero">
      <div className="merchant-hero-brand">
        {shopLogo && <img src={shopLogo} alt="" className="merchant-hero-logo" />}
        <h1 className="merchant-hero-title">{shopName}</h1>
      </div>
      <div className="merchant-hero-kpis">
        <div className="merchant-hero-kpi">
          <span>Today&apos;s visits</span>
          <strong>{kpis.todayVisits.toLocaleString("en-IN")}</strong>
        </div>
        <div className="merchant-hero-kpi">
          <span>Today&apos;s revenue</span>
          <strong>₹{kpis.todayRevenue.toLocaleString("en-IN")}</strong>
        </div>
        <div className="merchant-hero-kpi">
          <span>Repeat customers</span>
          <strong>{kpis.repeatCustomers.toLocaleString("en-IN")}</strong>
        </div>
        <div className="merchant-hero-kpi">
          <span>Retention revenue</span>
          <strong>₹{kpis.todayRetentionRevenue.toLocaleString("en-IN")}</strong>
        </div>
      </div>
    </section>
  );
}
