"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

/* Recharts takes hex, not CSS variables, so colours are restated here.
   The three takings series were run through the dataviz palette validator
   (lightness band, chroma floor, colour-blind separation all pass). The amber
   is below 3:1 against white, which is why every multi-series chart carries a
   legend and a tooltip rather than relying on colour alone. */
const INK = "#011244";
const FIRST = "#c8912a";
const OWN = "#4f64a8";
const CUSTVA = "#1f8a5b";
const GRID = "#e7e2d6";
const AXIS = { fontSize: 12, fill: "#4d5a80" };

interface SeriesPoint {
  date: string;
  visits: number;
  revenue: number | string;
  newCustomers: number;
  organicRepeatRevenue?: number | string;
  custvaInfluencedRevenue?: number | string;
  influencedVisits?: number;
}

interface DashboardData {
  totalCustomers: number;
  repeatCustomers: number;
  retentionRate: number;
  customerGrowth: number;
  totalRevenue: number;
  last30Days?: {
    organicRepeatRevenue: number;
    custvaInfluencedRevenue: number;
    influencedVisits: number;
  };
  series: SeriesPoint[];
}

interface CustomerAnalytics {
  topCustomers: Array<{ name: string; totalSpend: number }>;
  inactiveBuckets: { active7d: number; active30d: number; inactive: number };
  newVsRepeat: { newCustomers: number; repeatCustomers: number };
}

interface SegmentData {
  byPincode: Array<{ pincode: string; count: number }>;
  byAge: Array<{ band: string; count: number }>;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrShort = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(0)}k` : `₹${n}`;
/* The API returns midnight in IST as a UTC instant; formatting it in the
   browser's zone gives the calendar day it actually is. Printing the raw
   ISO string put "2026-09-12T18:30:00.000Z" under the chart. */
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function AnalyticsClient({
  dashboard,
  customers,
  segments,
  campaigns
}: {
  dashboard: DashboardData;
  customers: CustomerAnalytics;
  segments: SegmentData;
  campaigns: Array<{ campaignName: string; sentCount: number; deliveredCount: number; failedCount: number }>;
}) {
  const exportCsv = (type: string) => {
    window.open(`/api/analytics/export?type=${type}`, "_blank");
  };

  /* Takings split three ways. Visit revenue minus the two repeat halves is the
     first-visit share; the three are stacked because together they are the
     day's till, and never summed into one "retention" number. */
  const takings = dashboard.series.map((d) => {
    const total = Number(d.revenue) || 0;
    const own = Number(d.organicRepeatRevenue ?? 0);
    const custva = Number(d.custvaInfluencedRevenue ?? 0);
    return {
      day: dayLabel(d.date),
      first: Math.max(0, total - own - custva),
      own,
      custva,
      visits: Number(d.visits) || 0
    };
  });

  const broughtBack = dashboard.last30Days?.custvaInfluencedRevenue ?? 0;
  const broughtBackVisits = dashboard.last30Days?.influencedVisits ?? 0;

  const activity = [
    { name: "In the last 7 days", value: customers.inactiveBuckets.active7d },
    { name: "8–30 days ago", value: customers.inactiveBuckets.active30d },
    { name: "Not in 30+ days", value: customers.inactiveBuckets.inactive }
  ];

  const onceVsBack = [
    { name: "Came once", value: customers.newVsRepeat.newCustomers },
    { name: "Came back", value: customers.newVsRepeat.repeatCustomers }
  ];

  return (
    <>
      <header className="merchant-page-header">
        <div>
          <p className="merchant-eyebrow">Insights</p>
          <h1>How the shop is doing</h1>
        </div>
        <div className="merchant-form-actions">
          <button type="button" className="merchant-btn merchant-btn--secondary" onClick={() => exportCsv("customers")}>Download customers</button>
          <button type="button" className="merchant-btn merchant-btn--secondary" onClick={() => exportCsv("metrics")}>Download daily numbers</button>
        </div>
      </header>

      <div className="merchant-kpi-grid">
        <article className="merchant-kpi">
          <span>Customers</span>
          <strong>{dashboard.totalCustomers.toLocaleString("en-IN")}</strong>
          <small>with a phone number on file</small>
        </article>
        <article className="merchant-kpi">
          <span>Came back at least once</span>
          <strong>{dashboard.retentionRate}%</strong>
          <small>
            {dashboard.repeatCustomers.toLocaleString("en-IN")} of{" "}
            {dashboard.totalCustomers.toLocaleString("en-IN")} customers
          </small>
        </article>
        <article className="merchant-kpi merchant-kpi--custva">
          <span>Brought back by Custva · 30 days</span>
          <strong>{inr(broughtBack)}</strong>
          <small>
            {broughtBackVisits} visit{broughtBackVisits === 1 ? "" : "s"} after a reminder
          </small>
        </article>
        <article className="merchant-kpi">
          <span>All takings recorded</span>
          <strong>{inr(Number(dashboard.totalRevenue))}</strong>
          <small>since you started with Custva</small>
        </article>
      </div>

      <section className="merchant-panel merchant-chart-panel">
        <h2>Takings per day, last 30 days</h2>
        <p className="merchant-muted merchant-chart-note">
          Green is money from visits that came within 7 days of a Custva reminder. Regulars who
          were due back anyway are never counted as green. Blue came back on their own. Amber is
          first visits.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={takings} barCategoryGap={3}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={inrShort} width={52} />
            <Tooltip formatter={(v) => inr(Number(v))} cursor={{ fill: "rgba(1,18,68,0.05)" }} />
            <Legend iconType="circle" />
            <Bar dataKey="first" stackId="t" fill={FIRST} name="First visits" />
            <Bar dataKey="own" stackId="t" fill={OWN} name="Came back on their own" />
            <Bar dataKey="custva" stackId="t" fill={CUSTVA} name="Brought back by Custva" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="merchant-panel merchant-chart-panel">
        <h2>Visits per day</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={takings}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
            <Tooltip />
            <Line type="monotone" dataKey="visits" stroke={INK} strokeWidth={2} dot={false} name="Visits" />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <div className="merchant-analytics-grid">
        <section className="merchant-panel merchant-chart-panel">
          <h2>Did they come back?</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={onceVsBack} layout="vertical" margin={{ left: 8, right: 36 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={96} />
              <Tooltip />
              <Bar dataKey="value" fill={INK} name="Customers" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "#2c3757", fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="merchant-panel merchant-chart-panel">
          <h2>When they last came in</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={activity} layout="vertical" margin={{ left: 8, right: 36 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={120} />
              <Tooltip />
              <Bar dataKey="value" fill={INK} name="Customers" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "#2c3757", fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="merchant-panel merchant-chart-panel">
        <h2>Your best customers</h2>
        <ResponsiveContainer width="100%" height={Math.max(180, customers.topCustomers.length * 30)}>
          <BarChart data={customers.topCustomers.map((c) => ({ ...c, totalSpend: Number(c.totalSpend) }))} layout="vertical" margin={{ left: 8, right: 64 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={130} />
            <Tooltip formatter={(v) => inr(Number(v))} />
            <Bar dataKey="totalSpend" fill={INK} name="Spent so far" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "#2c3757", fontSize: 12, formatter: (v: unknown) => inr(Number(v)) }} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {campaigns.length > 0 && (
        <section className="merchant-panel merchant-chart-panel">
          <h2>Campaigns — sent and reached</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={campaigns} barGap={2}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="campaignName" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip />
              <Legend iconType="circle" />
              <Bar dataKey="sentCount" fill={OWN} name="Sent" radius={[4, 4, 0, 0]} />
              <Bar dataKey="deliveredCount" fill={CUSTVA} name="Reached their phone" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      <div className="merchant-analytics-grid">
        <section className="merchant-panel merchant-chart-panel">
          <h2>Where they live</h2>
          {segments.byPincode.length === 0 ? (
            <p className="merchant-muted">Add a pincode at the counter to see this.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={segments.byPincode.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 36 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="pincode" tick={AXIS} tickLine={false} axisLine={false} width={64} />
                <Tooltip />
                <Bar dataKey="count" fill={INK} name="Customers" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "#2c3757", fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
        <section className="merchant-panel merchant-chart-panel">
          <h2>Age</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={segments.byAge} layout="vertical" margin={{ left: 8, right: 36 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="band" tick={AXIS} tickLine={false} axisLine={false} width={72} />
              <Tooltip />
              <Bar dataKey="count" fill={INK} name="Customers" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "#2c3757", fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
    </>
  );
}
