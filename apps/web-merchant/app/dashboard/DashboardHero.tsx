export interface DashboardKpis {
  todayVisits: number;
  todayRevenue: number;
  todayRepeatRevenue: number;
  last30Days?: {
    organicRepeatRevenue: number;
    custvaInfluencedRevenue: number;
    influencedVisits: number;
  };
  /* Who is past their own expected revisit date right now. This is the
     question the product exists to answer, so it leads the page instead of
     sitting in a tile beside four till figures. */
  overdue?: {
    count: number;
    pastSpend: number;
    contactable: number;
    withRhythm: number;
  };
  /* The consent gap. Every customer created before the ledger existed has no
     record — which is not permission, and is the difference between a pilot
     that can send and one that cannot. */
  consent?: { granted: number; withdrawn: number; unknown: number };
  repeatCustomers: number;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * The lead statement. Three distinct states, because "nobody is overdue" and
 * "we do not know yet" are not the same sentence and a new shop must not be
 * told its retention is perfect.
 */
export function headline(overdue: DashboardKpis["overdue"]) {
  if (!overdue || overdue.withRhythm === 0) {
    return {
      tone: "learning" as const,
      line: "Learning your customers' rhythms",
      sub: "Record a few visits and Custva works out how often each customer normally comes in."
    };
  }
  if (overdue.count === 0) {
    return {
      tone: "clear" as const,
      line: "Nobody is overdue right now",
      sub: `All ${overdue.withRhythm.toLocaleString("en-IN")} customers with a known rhythm are on schedule.`
    };
  }
  const people = overdue.count === 1 ? "customer is" : "customers are";
  /* Past spend, stated as what it is: money already taken from these people.
     Never framed as money about to be lost — that number does not exist. */
  const spend = `They have spent ${inr(overdue.pastSpend)} with you so far.`;
  const gap =
    overdue.contactable < overdue.count
      ? ` ${overdue.contactable} of them can be messaged on WhatsApp.`
      : "";
  return {
    tone: "action" as const,
    line: `${overdue.count} ${people} overdue right now`,
    sub: spend + gap
  };
}

export function DashboardHero({
  shopLogo,
  kpis
}: {
  shopLogo: string | null;
  kpis: DashboardKpis;
}) {
  const state = headline(kpis.overdue);

  return (
    <section className={`merchant-hero merchant-hero--${state.tone}`}>
      <div className="merchant-hero-lead">
        {/* No shop name here — the topbar already carries it, and repeating it
            pushed the sentence that matters down the page. */}
        {shopLogo && <img src={shopLogo} alt="" className="merchant-hero-logo" />}
        <h1 className="merchant-hero-headline">{state.line}</h1>
        <p className="merchant-hero-sub">{state.sub}</p>
      </div>

      {/* A shop with no repeat history at all gets "₹0 · ₹0 came back on their
          own", which is three zeros saying nothing. Show the tile once there is
          something to report. */}
      {kpis.last30Days &&
        (kpis.last30Days.custvaInfluencedRevenue > 0 ||
          kpis.last30Days.organicRepeatRevenue > 0) && (
        <div className="merchant-hero-proof">
          {/* The one number Custva can stand behind: revenue from visits where
              a message reached a customer who was overdue. Shown apart from
              the repeat-revenue figures below, never summed into them. */}
          <span>Brought back by Custva · 30 days</span>
          <strong>{inr(kpis.last30Days.custvaInfluencedRevenue)}</strong>
          <small>
            {/* Until a message actually brings someone back this is ₹0, and
                "0 visits" beside it read like a broken tile rather than the
                starting state every shop is in. */}
            {kpis.last30Days.influencedVisits === 0
              ? "No return from a message yet"
              : `${kpis.last30Days.influencedVisits} visit${kpis.last30Days.influencedVisits === 1 ? "" : "s"}`}{" "}
            · {inr(kpis.last30Days.organicRepeatRevenue)} came back on their own
          </small>
        </div>
        )}
    </section>
  );
}

/** Today's till figures. Real, but not the reason to open the page. */
export function DashboardToday({ kpis }: { kpis: DashboardKpis }) {
  const stats = [
    { label: "Visits today", value: kpis.todayVisits.toLocaleString("en-IN") },
    { label: "Revenue today", value: inr(kpis.todayRevenue) },
    { label: "Repeat revenue today", value: inr(kpis.todayRepeatRevenue) },
    { label: "Repeat customers", value: kpis.repeatCustomers.toLocaleString("en-IN") }
  ];
  return (
    <div className="merchant-today">
      {stats.map((s) => (
        <div key={s.label} className="merchant-today-stat">
          <span>{s.label}</span>
          <strong>{s.value}</strong>
        </div>
      ))}
    </div>
  );
}
