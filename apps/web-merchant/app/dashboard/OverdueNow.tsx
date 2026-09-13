import Link from "next/link";

export interface OverdueCustomer {
  id: string;
  name: string;
  mobile: string;
  totalVisits: number;
  totalSpend: number;
  segment: "first_time" | "loyal" | "at_risk" | "dormant" | null;
  expectedGapDays: string | number | null;
  expectedRevisitAt: string | null;
}

const SEGMENT_LABEL: Record<string, string> = {
  first_time: "First visit",
  loyal: "On schedule",
  at_risk: "Overdue",
  dormant: "Long gone"
};

/** Days past the date this customer was expected back, by their own rhythm. */
function daysOverdue(row: OverdueCustomer): number | null {
  if (!row.expectedRevisitAt) return null;
  return Math.round((Date.now() - new Date(row.expectedRevisitAt).getTime()) / 86_400_000);
}

export function OverdueNow({
  customers,
  total
}: {
  customers: OverdueCustomer[];
  total: number;
}) {
  if (customers.length === 0) return null;

  return (
    <section className="merchant-panel merchant-overdue">
      <div className="merchant-overdue-head">
        <h2>Who is overdue</h2>
        <Link href="/customers?overdueOnly=1" className="merchant-link">
          {total > customers.length ? `See all ${total}` : "Open in customers"} →
        </Link>
      </div>
      {/* Ordered by how long each has been missing relative to their own
          rhythm, not by spend — a weekly regular who has skipped three weeks
          matters more than an occasional big spender who is a day late. */}
      <ul className="merchant-overdue-list">
        {customers.map((c) => {
          const late = daysOverdue(c);
          const gap = c.expectedGapDays ? Math.round(Number(c.expectedGapDays)) : null;
          return (
            <li key={c.id} className="merchant-overdue-row">
              <div className="merchant-overdue-who">
                <Link href={`/customers/${c.id}`} className="merchant-overdue-name">
                  {c.name}
                </Link>
                <span className="merchant-overdue-meta">
                  {c.mobile} · {c.totalVisits} visit{c.totalVisits === 1 ? "" : "s"} · ₹
                  {Number(c.totalSpend).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="merchant-overdue-when">
                <strong>
                  {late === null
                    ? "—"
                    : late === 0
                      ? "Due today"
                      : `${late} day${late === 1 ? "" : "s"} late`}
                </strong>
                {gap ? <span>usually every {gap}d</span> : null}
              </div>
              {c.segment && (
                <span className={`seg-pill seg-${c.segment}`}>{SEGMENT_LABEL[c.segment]}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
