"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ConsentPanel, type ConsentRecord } from "./ConsentPanel";
import {
  dueLine,
  formatMobile,
  rhythmLine,
  statusFor,
  type Segment
} from "../../lib/customer-status";

interface Visit {
  billingAmount: number;
  visitAt: string;
  ageAtVisit: number | null;
  notes: string | null;
  returnType?: "organic" | "custva_influenced";
  isRepeatVisit?: boolean;
}

interface Upcoming {
  scheduledAt: string;
  lifecycleDay: string;
  headerText: string | null;
  body: string;
}

interface SentMessage {
  id: string;
  sentAt: string;
  status: string;
  deliveredAt: string | null;
  readAt: string | null;
  label: string | null;
  kind: "campaign" | "automatic";
}

interface CustomerDetail {
  id: string;
  name: string;
  mobile: string;
  pincode: string | null;
  age: number | null;
  totalSpend: number;
  totalVisits: number;
  lastVisit: string | null;
  autoTags: string[];
  segment: Segment | null;
  expectedGapDays: string | number | null;
  expectedRevisitAt: string | null;
  explanation: string | null;
  shopName: string | null;
  upcoming: Upcoming[];
  messages: SentMessage[];
  visits: Visit[];
  consentState: "granted" | "withdrawn" | "unknown" | null;
  consents: ConsentRecord[];
}

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });

/** Read beats delivered beats sent — the furthest the message is known to have got. */
function messageOutcome(m: SentMessage): string {
  if (m.readAt) return `Read ${dateTime(m.readAt)}`;
  if (m.deliveredAt) return `Delivered ${dateTime(m.deliveredAt)}`;
  if (m.status === "failed") return "Did not go through";
  return "Sent";
}

export function CustomerDetailClient({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [allVisits, setAllVisits] = useState<Visit[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}`);
    const json = (await res.json()) as { success: boolean; data?: CustomerDetail };
    if (json.success && json.data) setCustomer(json.data);

    const visitsRes = await fetch(`/api/customers/${customerId}/visits?limit=100`);
    const visitsJson = (await visitsRes.json()) as { success: boolean; data?: { items: Visit[] } };
    if (visitsJson.success && visitsJson.data) setAllVisits(visitsJson.data.items);
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!customer) return <p className="merchant-muted">Loading customer...</p>;

  const visits = allVisits.length ? allVisits : customer.visits;
  const status = statusFor(customer.segment, customer.expectedRevisitAt);
  const rhythm = rhythmLine(customer.expectedGapDays, customer.totalVisits);
  const broughtBack = visits.filter((v) => v.returnType === "custva_influenced");
  const next = customer.upcoming?.[0];
  const canMessage = customer.consentState === "granted";
  /* The preview shows what the customer will read, placeholders filled. */
  const fill = (text: string) =>
    text
      .replace(/\{\{name\}\}/g, customer.name.split(" ")[0])
      .replace(/\{\{shop_name\}\}/g, customer.shopName ?? "the shop");

  return (
    <>
      <header className="merchant-page-header">
        <div>
          <p className="merchant-eyebrow"><Link href="/customers">Customers</Link></p>
          <h1>{customer.name}</h1>
          <p className="merchant-muted">
            {formatMobile(customer.mobile)}
            {customer.pincode ? ` · ${customer.pincode}` : ""}
            {customer.age ? ` · ${customer.age} yrs` : ""}
          </p>
        </div>
      </header>

      {/* The page answers three questions in order: how are they doing, when
          do we expect them, and what is Custva going to do about it. The
          record-keeping (visits, consent trail) follows. */}
      <section className="merchant-panel customer-summary">
        <div className="customer-summary-status">
          {status && <span className={`seg-pill seg-${status.key}`}>{status.label}</span>}
          {customer.explanation && <p>{customer.explanation}</p>}
        </div>
        <dl className="customer-summary-facts">
          <div>
            <dt>Visits</dt>
            <dd>{customer.totalVisits}</dd>
          </div>
          <div>
            <dt>Spent so far</dt>
            <dd>{inr(customer.totalSpend)}</dd>
          </div>
          <div>
            <dt>Last came</dt>
            <dd>{customer.lastVisit ? shortDate(customer.lastVisit) : "—"}</dd>
          </div>
          <div>
            <dt>Next visit expected</dt>
            <dd>
              {customer.expectedRevisitAt ? shortDate(customer.expectedRevisitAt) : "—"}
              <small>
                {dueLine(customer.expectedRevisitAt)}
                {rhythm ? ` · ${rhythm}` : ""}
              </small>
            </dd>
          </div>
        </dl>
      </section>

      <section className="merchant-panel customer-next">
        <h2>What Custva does next</h2>
        {!canMessage ? (
          <p className="merchant-muted">
            {customer.consentState === "withdrawn"
              ? "Nothing. They asked not to be messaged, so Custva will not contact them."
              : "Nothing yet. They have not agreed to WhatsApp messages — ask at the counter and tick the box on their next visit."}
          </p>
        ) : next ? (
          <div className="customer-next-message">
            <p className="customer-next-when">
              WhatsApp scheduled for <strong>{dateTime(next.scheduledAt)}</strong>
            </p>
            <blockquote>
              {next.headerText && <strong>{fill(next.headerText)}</strong>}
              <span>{fill(next.body)}</span>
            </blockquote>
            <p className="merchant-muted">
              If they come in before then, this is cancelled automatically — nobody gets a
              reminder for a visit they already made.
              {customer.upcoming.length > 1
                ? ` ${customer.upcoming.length - 1} more follow${customer.upcoming.length - 1 === 1 ? "s" : ""} only if they still have not come.`
                : ""}
            </p>
          </div>
        ) : (
          <p className="merchant-muted">
            Nothing scheduled. Custva waits until they are late by their own habit before it
            sends a reminder.
          </p>
        )}
      </section>

      {broughtBack.length > 0 && (
        <section className="merchant-panel customer-brought-back">
          <h2>Brought back by Custva</h2>
          <p>
            <strong>
              {broughtBack.length} visit{broughtBack.length === 1 ? "" : "s"} ·{" "}
              {inr(broughtBack.reduce((sum, v) => sum + Number(v.billingAmount), 0))}
            </strong>{" "}
            — each came within 7 days of a Custva WhatsApp, at a time they were not a regular
            who was due anyway.
          </p>
        </section>
      )}

      <ConsentPanel
        customerId={customerId}
        state={customer.consentState}
        records={customer.consents ?? []}
        onChange={() => void load()}
      />

      {customer.messages?.length > 0 && (
        <section className="merchant-panel">
          <h2>WhatsApp messages sent</h2>
          <table className="merchant-table">
            <thead>
              <tr><th>Sent</th><th>Message</th><th>Type</th><th>What happened</th></tr>
            </thead>
            <tbody>
              {customer.messages.map((m) => (
                <tr key={m.id}>
                  <td>{dateTime(m.sentAt)}</td>
                  <td>{m.label ?? "—"}</td>
                  <td>{m.kind === "campaign" ? "Campaign" : "Automatic"}</td>
                  <td>{messageOutcome(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="merchant-panel">
        <h2>Visits</h2>
        <table className="merchant-table">
          <thead><tr><th>Date</th><th>Bill</th><th>How they came back</th></tr></thead>
          <tbody>
            {visits.map((v, i) => (
              <tr key={i}>
                <td>{dateTime(v.visitAt)}</td>
                <td>{inr(v.billingAmount)}</td>
                <td>
                  {v.returnType === "custva_influenced" ? (
                    <span className="seg-pill seg-brought-back">After a Custva message</span>
                  ) : v.isRepeatVisit === false ? (
                    <span className="merchant-muted">First visit</span>
                  ) : (
                    <span className="merchant-muted">On their own</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
