"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * The commission ledger — FR-M5.
 *
 * "We charge only for returns we caused" is the commercial promise, so this is
 * the screen a merchant will argue with. It is built to be argued with: every
 * charge names the customer, the visit, the amount they actually spent, and
 * the message that reached them beforehand. A total with no rows behind it is
 * not a bill anyone should pay.
 *
 * The rate is stored on each event as well as on the merchant, so changing the
 * rate never rewrites what was already charged.
 */

interface CommissionRow {
  id: string;
  status: "pending" | "invoiced" | "paid" | "waived";
  influencedAmount: string;
  commissionRate: string;
  commissionAmount: string;
  createdAt: string;
  customerId: string;
  customerName: string;
  mobile: string;
  visitAt: string;
  messageId: string | null;
  messageSentAt: string | null;
  campaignName: string | null;
}

interface CommissionData {
  items: CommissionRow[];
  byStatus: Record<string, { count: number; amount: number; influenced: number }>;
  currentRate: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Not yet invoiced",
  invoiced: "Invoiced",
  paid: "Paid",
  waived: "Waived"
};

/* Paise matter on a commission line — ₹20.5 is not a number anyone writes on
   an invoice. Whole rupees stay clean, so a ₹1,620 total does not gain a
   meaningless ".00". */
const inr = (n: number | string) => {
  const v = Number(n);
  return `₹${v.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
};
const day = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function CommissionClient() {
  const [data, setData] = useState<CommissionData | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/commission${status ? `?status=${status}` : ""}`);
      const json = (await res.json()) as { success: boolean; data?: CommissionData };
      setData(json.success && json.data ? json.data : null);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = data?.byStatus.pending;
  const paid = data?.byStatus.paid;

  return (
    <>
      <header className="merchant-page-header">
        <div>
          <p className="merchant-eyebrow">Billing</p>
          <h1>What Custva has charged</h1>
        </div>
      </header>

      {/* Stated before the total, not after it. A merchant should know what
          they are looking at before they look at the number. */}
      <section className="merchant-panel merchant-commission-basis">
        <p>
          Custva charges only on visits where a message reached a customer who was overdue, and
          they came back within {""}
          <strong>7 days</strong>. Regulars who were coming back anyway are never charged for —
          they are shielded automatically.
        </p>
        {data ? (
          <p className="merchant-muted">
            Current rate: <strong>{(data.currentRate * 100).toFixed(1)}%</strong> of the amount
            those customers spent. Each charge below stores the rate it was made at, so changing
            the rate never rewrites an old one.
          </p>
        ) : null}
      </section>

      <div className="merchant-today">
        <div className="merchant-today-stat">
          <span>Not yet invoiced</span>
          <strong>{inr(pending?.amount ?? 0)}</strong>
        </div>
        <div className="merchant-today-stat">
          <span>Paid to date</span>
          <strong>{inr(paid?.amount ?? 0)}</strong>
        </div>
        <div className="merchant-today-stat">
          <span>Revenue it was charged on</span>
          <strong>{inr(pending?.influenced ?? 0)}</strong>
        </div>
        <div className="merchant-today-stat">
          <span>Returns charged for</span>
          <strong>{(pending?.count ?? 0) + (paid?.count ?? 0)}</strong>
        </div>
      </div>

      <section className="merchant-panel">
        <div className="merchant-overdue-head">
          <h2>Every charge, line by line</h2>
          <select
            className="merchant-inline-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="pending">Not yet invoiced</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>
        </div>

        {loading ? (
          <p className="merchant-muted">Loading…</p>
        ) : !data?.items.length ? (
          /* Not an error state. Nothing has been charged because nothing has
             been sent — saying so is more use than an empty table. */
          <p className="merchant-muted">
            Nothing charged yet. A charge appears here only after a message brings a customer
            back, so this stays empty until campaigns are actually sending.
          </p>
        ) : (
          <table className="merchant-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Came back</th>
                <th>What they spent</th>
                <th>Because of</th>
                <th>Rate</th>
                <th>Charge</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/customers/${r.customerId}`} className="merchant-link">
                      {r.customerName}
                    </Link>
                    <small className="seg-gap">{r.mobile}</small>
                  </td>
                  <td>{day(r.visitAt)}</td>
                  <td>{inr(r.influencedAmount)}</td>
                  <td>
                    {/* The evidence for this specific charge. Without it the
                        merchant has to take the number on trust. */}
                    {r.messageSentAt ? (
                      <>
                        {r.campaignName ?? "A follow-up message"}
                        <small className="seg-gap">sent {day(r.messageSentAt)}</small>
                      </>
                    ) : (
                      <span className="merchant-muted">—</span>
                    )}
                  </td>
                  <td>{(Number(r.commissionRate) * 100).toFixed(1)}%</td>
                  <td>
                    <strong>{inr(r.commissionAmount)}</strong>
                  </td>
                  <td>
                    <span className={`consent-pill commission-${r.status}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
