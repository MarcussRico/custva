"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CustomerPrefixTypeahead } from "./CustomerPrefixTypeahead";
import { ReturningCustomerCard, type LookupCustomer } from "./ReturningCustomerCard";

/* The exact words staff are meant to say, stored verbatim with every consent
   record. Consent is to a specific statement — if this wording changes, the
   version tag is what proves prior consent was to the old one. Change the
   version whenever the text changes. */
const CONSENT_NOTICE =
  "Customer agreed to receive offers and reminders from this shop on WhatsApp.";
const CONSENT_NOTICE_VERSION = "counter-v1";

interface SavedVisit {
  name: string;
  segment: string | null;
  expectedGapDays: string | number | null;
  expectedRevisitAt: string | null;
  consentState: "granted" | "withdrawn" | "unknown" | null;
  totalVisits: number;
  visit?: { isFirstVisit: boolean; returnType: string };
}

/**
 * The confirmation a counter actually needs: saved, and what happens next.
 * Staff should not have to open another screen to know whether this person
 * will get a WhatsApp or when they are expected back.
 */
function describeSaved(saved?: SavedVisit): { title: string; detail: string } {
  if (!saved) return { title: "Saved.", detail: "" };
  const first = saved.name.split(" ")[0];
  const when = saved.expectedRevisitAt
    ? new Date(saved.expectedRevisitAt).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short"
      })
    : null;
  const messaged =
    saved.consentState === "granted"
      ? "A thank-you WhatsApp is scheduled for a few minutes from now."
      : saved.consentState === "withdrawn"
        ? "They asked not to be messaged, so no WhatsApp will go out."
        : "No WhatsApp will go out until they agree to messages.";

  if (saved.visit?.isFirstVisit) {
    return {
      title: `${first} added — first visit.`,
      detail: messaged
    };
  }
  const back =
    saved.visit?.returnType === "custva_influenced"
      ? `${first} came back after a Custva reminder. `
      : "";
  const next = when ? `Next visit expected around ${when}. ` : "";
  return {
    title: `Visit saved for ${first} — visit ${saved.totalVisits}.`,
    detail: `${back}${next}${messaged}`
  };
}

export function CustomerQuickEntryForm({
  onPhoneDigitsChange
}: {
  onPhoneDigitsChange?: (digits: string) => void;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [billingAmount, setBillingAmount] = useState("");
  const [pincode, setPincode] = useState("");
  const [age, setAge] = useState("");
  /* A real birthday, so birthday campaigns reach the right people. The age
     field beside it stays for the customers who will only give that. */
  const [dob, setDob] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupCustomer[]>([]);
  const [selected, setSelected] = useState<LookupCustomer | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ title: string; detail: string } | null>(null);

  const phoneDigits = phone.replace(/\D/g, "");
  const isReturning = Boolean(selected);
  /* Consent is a state of the person, not of this form. Someone who already
     agreed is not asked again, and someone who asked to stop is not offered a
     tickbox that would quietly undo it — that needs a deliberate act on their
     record. Only the genuinely unrecorded get the prompt. */
  const consentState = selected?.consentState ?? null;
  const askForConsent = !selected || consentState === "unknown" || consentState == null;

  useEffect(() => {
    onPhoneDigitsChange?.(phoneDigits);
  }, [phoneDigits, onPhoneDigitsChange]);

  useEffect(() => {
    if (phoneDigits.length === 0) {
      setLookupResults([]);
      setSelected(null);
      return;
    }

    const timer = setTimeout(() => {
      void fetch(`/api/customers/lookup?mobilePrefix=${encodeURIComponent(phoneDigits)}`)
        .then((res) => res.json())
        .then((json: { success: boolean; data?: { items: LookupCustomer[] } }) => {
          if (json.success && json.data) {
            setLookupResults(json.data.items);
            const exact = json.data.items.find(
              (c) => c.mobile.replace(/\D/g, "").endsWith(phoneDigits) && phoneDigits.length >= 10
            );
            if (exact && !selected) {
              setSelected(exact);
              setName(exact.name);
              setPincode(exact.pincode ?? "");
              setAge(exact.age != null ? String(exact.age) : "");
            }
          }
        })
        .catch(() => setLookupResults([]));
    }, 280);

    return () => clearTimeout(timer);
  }, [phoneDigits, selected]);

  const selectCustomer = useCallback((customer: LookupCustomer) => {
    setSelected(customer);
    setName(customer.name);
    setPhone(customer.mobile.replace(/^\+91/, ""));
    setPincode(customer.pincode ?? "");
    setAge(customer.age != null ? String(customer.age) : "");
    setLookupResults([]);
  }, []);

  const clearForm = () => {
    setPhone("");
    setName("");
    setBillingAmount("");
    setPincode("");
    setAge("");
    setDob("");
    setSelected(null);
    setLookupResults([]);
    setConsentGiven(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        mobile: phone.trim(),
        billingAmount: Number(billingAmount) || 0
      };
      if (pincode.trim()) payload.pincode = pincode.trim();
      if (age.trim()) payload.age = Number(age);
      if (dob) payload.dateOfBirth = dob;
      /* Sent only when the box was actually ticked. An unticked box is not a
         refusal, it is silence — and silence has to stay silence, or the
         ledger fills up with consent nobody gave. */
      if (askForConsent && consentGiven) {
        payload.consent = {
          granted: true,
          method: "counter_verbal",
          noticeText: CONSENT_NOTICE,
          noticeVersion: CONSENT_NOTICE_VERSION
        };
      }

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: SavedVisit;
      };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Could not save. Check the phone number and bill amount.");
        return;
      }
      setSuccess(describeSaved(data.data));
      clearForm();
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="merchant-panel">
      <h2>Add a visit</h2>
      <p className="merchant-muted merchant-entry-lead">
        Type the phone number first. If they have been here before, their name fills in by itself.
      </p>
      <form className="merchant-quick-entry" onSubmit={submit} autoComplete="off">
        <label className="merchant-quick-phone">
          Phone number
          <input
            name="custva-phone"
            inputMode="numeric"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            required
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
              setSelected(null);
            }}
            placeholder="10-digit mobile"
          />
        </label>
        <div className="merchant-quick-row">
          <label>
            Name
            <input
              name="custva-name"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Bill amount (₹)
            <input
              name="custva-billing"
              type="number"
              min={0}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              required
              value={billingAmount}
              onChange={(e) => setBillingAmount(e.target.value)}
            />
          </label>
        </div>
        <div className="merchant-quick-row">
          <label>
            Pincode (optional)
            <input
              name="custva-pincode"
              maxLength={6}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <label>
            Age (optional)
            <input
              name="custva-age"
              type="number"
              min={1}
              max={120}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </label>
        </div>
        <div className="merchant-quick-row">
          <label>
            Birthday (optional)
            <input
              name="custva-dob"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </label>
          <span />
        </div>

        {phoneDigits.length >= 1 && !selected && lookupResults.length > 0 && (
          <CustomerPrefixTypeahead items={lookupResults} onSelect={selectCustomer} />
        )}
        {selected && <ReturningCustomerCard customer={selected} />}

        {askForConsent ? (
          <label className="merchant-consent-check">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
            />
            <span>
              <strong>{CONSENT_NOTICE}</strong>
              <small>
                Tick only if you actually asked and they said yes. Leaving it
                unticked is fine — they simply will not be messaged until they
                agree.
              </small>
            </span>
          </label>
        ) : (
          <p className={`merchant-consent-state merchant-consent-state--${consentState}`}>
            {consentState === "withdrawn"
              ? "This customer asked to stop receiving messages. Recording the visit will not message them."
              : "Already agreed to WhatsApp messages."}
          </p>
        )}

        <div className="merchant-form-actions">
          <button type="submit" className="merchant-btn merchant-btn--primary" disabled={loading}>
            {isReturning ? "Save visit" : "Save new customer"}
          </button>
        </div>
      </form>
      {error && <p className="merchant-error">{error}</p>}
      {success && (
        <div className="merchant-success merchant-entry-saved" role="status">
          <strong>{success.title}</strong>
          <span>{success.detail}</span>
        </div>
      )}
    </section>
  );
}
