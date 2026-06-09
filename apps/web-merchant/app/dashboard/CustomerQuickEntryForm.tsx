"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CustomerPrefixTypeahead } from "./CustomerPrefixTypeahead";
import { ReturningCustomerCard, type LookupCustomer } from "./ReturningCustomerCard";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const phoneDigits = phone.replace(/\D/g, "");
  const isReturning = Boolean(selected);

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
