"use client";

import { useState } from "react";

/**
 * The evidence trail for one customer — defect 7.
 *
 * The panel exists to answer one question a merchant will eventually be asked
 * about a specific person: *did she agree, and how do you know?* So it leads
 * with the current state, shows every event behind it, and quotes the exact
 * wording she was given — not a summary of it.
 *
 * Recording is deliberately an append, never an edit. There is no way from
 * here to change or remove a past record, because a consent history a merchant
 * can tidy up is not evidence of anything.
 */

export interface ConsentRecord {
  id: string;
  action: "granted" | "withdrawn";
  method: string;
  source: string;
  noticeText: string | null;
  noticeVersion: string | null;
  inboundBody: string | null;
  occurredAt: string;
}

const STATE_LABEL: Record<string, string> = {
  granted: "Agreed to WhatsApp messages",
  withdrawn: "Asked to stop",
  unknown: "No consent recorded"
};

const METHOD_LABEL: Record<string, string> = {
  counter_verbal: "asked at the counter",
  counter_form: "signed a form",
  whatsapp_reply: "replied on WhatsApp",
  merchant_import: "supplied in an import",
  admin_correction: "corrected by Custva"
};

const NOTICE =
  "Customer agreed to receive offers and reminders from this shop on WhatsApp.";
const NOTICE_VERSION = "counter-v1";

export function ConsentPanel({
  customerId,
  state,
  records,
  onChange
}: {
  customerId: string;
  state: "granted" | "withdrawn" | "unknown" | null;
  records: ConsentRecord[];
  onChange: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const current = state ?? "unknown";

  const record = async (granted: boolean) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/customers/${customerId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          granted,
          method: "counter_verbal",
          ...(granted ? { noticeText: NOTICE, noticeVersion: NOTICE_VERSION } : {})
        })
      });
      if (!res.ok) {
        setError("Could not save that. Nothing was recorded.");
        return;
      }
      onChange();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="merchant-panel">
      <div className="merchant-consent-head">
        <h2>Consent</h2>
        <span className={`consent-pill consent-${current}`}>{STATE_LABEL[current]}</span>
      </div>

      {current === "unknown" && (
        <p className="merchant-muted merchant-consent-note">
          This customer was added before Custva kept consent records. Nothing here proves they
          agreed to WhatsApp messages, so ask them next time they come in.
        </p>
      )}

      {records.length > 0 && (
        <ul className="merchant-consent-log">
          {records.map((r) => (
            <li key={r.id}>
              <strong>{r.action === "granted" ? "Agreed" : "Asked to stop"}</strong>
              <span>
                {new Date(r.occurredAt).toLocaleString("en-IN")} ·{" "}
                {METHOD_LABEL[r.method] ?? r.method}
              </span>
              {/* Quoted, not paraphrased. For a counter grant these are the
                  words the customer was read; for a reply they are the
                  customer's own. Either way, the exact wording is the
                  evidence, so it is shown rather than summarised. */}
              {r.inboundBody ? (
                <blockquote>They sent: “{r.inboundBody}”</blockquote>
              ) : r.noticeText ? (
                <blockquote>“{r.noticeText}”</blockquote>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="merchant-consent-actions">
        {current !== "granted" && (
          <button
            type="button"
            className="merchant-btn merchant-btn--primary"
            disabled={saving}
            onClick={() => void record(true)}
          >
            They agreed just now
          </button>
        )}
        {current !== "withdrawn" && (
          <button
            type="button"
            className="merchant-btn"
            disabled={saving}
            onClick={() => void record(false)}
          >
            They asked to stop
          </button>
        )}
      </div>
      <p className="merchant-consent-foot">
        Recording adds to the history below — it never edits or removes what is already there.
      </p>
      {error && <p className="merchant-error">{error}</p>}
    </section>
  );
}
