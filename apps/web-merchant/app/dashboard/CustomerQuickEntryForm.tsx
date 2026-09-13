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
  const [lookupResults, setLookupResults] = useState<LookupCustomer[]>([]);
  const [selected, setSelected] = useState<LookupCustomer | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    setSelected(null);
    setLookupResults([]);
    setConsentGiven(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        mobile: phone.trim(),
        billingAmount: Number(billingAmount) || 0
      };
      if (pincode.trim()) payload.pincode = pincode.trim();
      if (age.trim()) payload.age = Number(age);
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
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to save customer.");
        return;
      }
      setSuccess(isReturning ? "Visit recorded successfully." : "Customer added successfully.");
      clearForm();
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="merchant-panel">
      <h2 style={{ paddingBottom: "16px" }}>Customer Entry</h2>
      <form className="merchant-quick-entry" onSubmit={submit} autoComplete="off">
        <label className="merchant-quick-phone">
          Phone
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
            Billing amount (INR)
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
            {isReturning ? "Record Visit" : "Add Customer"}
          </button>
        </div>
      </form>
      {error && <p className="merchant-error">{error}</p>}
      {success && <p className="merchant-success">{success}</p>}
    </section>
  );
}
