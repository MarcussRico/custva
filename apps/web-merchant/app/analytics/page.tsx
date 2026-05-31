const trend = [
  { day: "Mon", retention: 28 },
  { day: "Tue", retention: 29 },
  { day: "Wed", retention: 30 },
  { day: "Thu", retention: 32 },
  { day: "Fri", retention: 33 }
];

export default function AnalyticsPage() {
  return (
    <main className="merchant-shell">
      <header className="merchant-header">
        <h1>Retention Analytics</h1>
        <span className="badge">MVP</span>
      </header>
      <section className="kpi-card">
        <h3>Retention Trend (5 days)</h3>
        {trend.map((item) => (
          <p key={item.day}>
            {item.day}: {item.retention}%
          </p>
        ))}
      </section>
    </main>
  );
}
