"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell
} from "recharts";

/* Recharts takes hex, not CSS variables, so the brand palette has to be
   restated here. These are the true logo values (#011244 / #fdd304) plus the
   coral that keeps navy-and-yellow from reading as a warning sign — the same
   five the landing page uses. Kept in one place so a chart cannot drift. */
const COLORS = ["#011244", "#fdd304", "#4d5a80", "#ff5c3a", "#0b7d4d"];
const INK = COLORS[0];
const YELLOW = COLORS[1];
const INK_SOFT = COLORS[2];

interface DashboardData {
  totalCustomers: number;
  repeatCustomers: number;
  retentionRate: number;
  customerGrowth: number;
  totalRevenue: number;
  series: Array<{ date: string; visits: number; revenue: number; newCustomers: number }>;
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

  const inactiveData = [
    { name: "Active 7d", value: customers.inactiveBuckets.active7d },
    { name: "Active 30d", value: customers.inactiveBuckets.active30d },
    { name: "Inactive", value: customers.inactiveBuckets.inactive }
  ];

  return (
    <>
      <header className="merchant-page-header">
        <div>
          <p className="merchant-eyebrow">Insights</p>
          <h1>Analytics</h1>
        </div>
        <div className="merchant-form-actions">
          <button type="button" className="merchant-btn merchant-btn--secondary" onClick={() => exportCsv("customers")}>Export Customers</button>
          <button type="button" className="merchant-btn merchant-btn--secondary" onClick={() => exportCsv("metrics")}>Export Metrics</button>
        </div>
      </header>

      <div className="merchant-kpi-grid">
        <article className="merchant-kpi"><span>Total Customers</span><strong>{dashboard.totalCustomers}</strong></article>
        <article className="merchant-kpi"><span>Retention Rate</span><strong>{dashboard.retentionRate}%</strong></article>
        <article className="merchant-kpi"><span>Customer Growth (30d)</span><strong>{dashboard.customerGrowth}%</strong></article>
        <article className="merchant-kpi"><span>Total Revenue</span><strong>₹{Number(dashboard.totalRevenue).toLocaleString("en-IN")}</strong></article>
      </div>

      <section className="merchant-panel merchant-chart-panel">
        <h2>Visits & Revenue (30 days)</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={dashboard.series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="visits" stroke={INK} fill={INK_SOFT} name="Visits" />
            <Area type="monotone" dataKey="revenue" stroke={YELLOW} fill="#fff2cc" name="Revenue" />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <div className="merchant-analytics-grid">
        <section className="merchant-panel merchant-chart-panel">
          <h2>New vs Repeat</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[{ name: "New", value: customers.newVsRepeat.newCustomers }, { name: "Repeat", value: customers.newVsRepeat.repeatCustomers }]} dataKey="value" nameKey="name" outerRadius={80} label>
                <Cell fill={INK} />
                <Cell fill={YELLOW} />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </section>

        <section className="merchant-panel merchant-chart-panel">
          <h2>Activity Buckets</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={inactiveData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill={INK_SOFT} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="merchant-panel merchant-chart-panel">
        <h2>Top Customers by Spend</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={customers.topCustomers}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="totalSpend" fill={INK} name="Spend (INR)" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="merchant-panel merchant-chart-panel">
        <h2>Campaign Performance</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={campaigns}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="campaignName" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="sentCount" stroke={INK} name="Sent" />
            <Line type="monotone" dataKey="deliveredCount" stroke="#027a48" name="Delivered" />
            <Line type="monotone" dataKey="failedCount" stroke="#b42318" name="Failed" />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <div className="merchant-analytics-grid">
        <section className="merchant-panel merchant-chart-panel">
          <h2>Customers by Pincode</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={segments.byPincode.slice(0, 10)}>
              <XAxis dataKey="pincode" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill={YELLOW} />
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="merchant-panel merchant-chart-panel">
          <h2>Customers by Age Band</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={segments.byAge} dataKey="count" nameKey="band" outerRadius={80} label>
                {segments.byAge.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </section>
      </div>
    </>
  );
}
