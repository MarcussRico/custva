export interface DashboardKpis {
  todayVisits: number;
  todayRevenue: number;
  todayRepeatRevenue: number;
  last30Days?: {
    organicRepeatRevenue: number;
    custvaInfluencedRevenue: number;
    influencedVisits: number;
  };
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
          {/* Renamed from "Retention revenue". This is every repeat visit,
              including regulars who were coming back anyway — calling it
              retention revenue implied Custva produced it. */}
          <span>Repeat revenue today</span>
          <strong>₹{kpis.todayRepeatRevenue.toLocaleString("en-IN")}</strong>
        </div>
        {kpis.last30Days && (
          <div className="merchant-hero-kpi merchant-hero-kpi--wide">
            {/* The number Custva can actually stand behind: revenue from
                visits where a message reached a customer who was overdue.
                Shown separately from the figure above, never summed into it. */}
            <span>Brought back by Custva · 30 days</span>
            <strong>
              ₹{kpis.last30Days.custvaInfluencedRevenue.toLocaleString("en-IN")}
            </strong>
            <small>
              {kpis.last30Days.influencedVisits} visit
              {kpis.last30Days.influencedVisits === 1 ? "" : "s"} · ₹
              {kpis.last30Days.organicRepeatRevenue.toLocaleString("en-IN")} came
              back on their own
            </small>
          </div>
        )}
      </div>
    </section>
  );
}
