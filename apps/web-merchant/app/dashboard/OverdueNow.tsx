import Link from "next/link";
import { dueLine, formatMobile, rhythmLine, statusFor } from "../lib/customer-status";

export interface OverdueCustomer {
  id: string;
  name: string;
  mobile: string;
  totalVisits: number;
  totalSpend: number;
  segment: "first_time" | "loyal" | "at_risk" | "dormant" | null;
  expectedGapDays: string | number | null;
  expectedRevisitAt: string | null;
  consentState: "granted" | "withdrawn" | "unknown" | null;
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
        <div className="merchant-overdue-actions">
          <Link href="/customers?segment=at_risk,dormant" className="merchant-link">
            {total > customers.length ? `See all ${total}` : "Open in customers"}
          </Link>
          {/* The list was previously a dead end: it told a merchant who was
              overdue and left them to rebuild that audience by hand in the
              campaign builder. This carries the selection across. */}
          <Link
            href="/campaigns?segments=at_risk,dormant"
            className="merchant-btn merchant-btn--primary merchant-btn--sm"
          >
            Message them
          </Link>
        </div>
      </div>
      {/* Ordered by how long each has been missing relative to their own
          rhythm, not by spend — a weekly regular who has skipped three weeks
          matters more than an occasional big spender who is a day late. */}
      <ul className="merchant-overdue-list">
        {customers.map((c) => {
          const status = statusFor(c.segment, c.expectedRevisitAt);
          const rhythm = rhythmLine(c.expectedGapDays, c.totalVisits);
          return (
            <li key={c.id} className="merchant-overdue-row">
              <div className="merchant-overdue-who">
                <Link href={`/customers/${c.id}`} className="merchant-overdue-name">
                  {c.name}
                </Link>
                <span className="merchant-overdue-meta">
                  {formatMobile(c.mobile)} · {c.totalVisits} visit{c.totalVisits === 1 ? "" : "s"} · ₹
                  {Number(c.totalSpend).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="merchant-overdue-when">
                <strong>{dueLine(c.expectedRevisitAt)}</strong>
                {rhythm ? <span>{rhythm}</span> : null}
              </div>
              {/* Someone who asked to stop is still overdue and the merchant
                  should still know — they might catch them in person. But
                  saying so here is what makes the campaign count add up: this
                  panel shows 4 and "Message them" matches 3, and without this
                  the difference looks like a bug rather than a decision. */}
              {c.consentState === "withdrawn" ? (
                <span className="consent-pill consent-withdrawn">Asked to stop</span>
              ) : status ? (
                <span className={`seg-pill seg-${status.key}`}>{status.label}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
