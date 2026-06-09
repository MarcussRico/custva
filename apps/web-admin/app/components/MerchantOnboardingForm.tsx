"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_LOGO_BYTES = 500 * 1024;

interface FormState {
  shopName: string;
  shopAddress: string;
  pincode: string;
  ownerName: string;
  email: string;
  password: string;
  currentRevenue: string;
}

const INITIAL: FormState = {
  shopName: "",
  shopAddress: "",
  pincode: "",
  ownerName: "",
  email: "",
  password: "",
  currentRevenue: ""
};

export function MerchantOnboardingForm({
  onSuccess,
  compact = false
}: {
  onSuccess?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [shopLogo, setShopLogo] = useState<string>("");
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const resetForm = () => {
    setForm(INITIAL);
    setShopLogo("");
    setLogoPreview("");
    setError("");
  };

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Shop logo must be an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Shop logo must be 500 KB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setShopLogo(result);
      setLogoPreview(result);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const clearLogo = () => {
    setShopLogo("");
    setLogoPreview("");
  };

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
    setSuccess("");
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!/^\d{6}$/.test(form.pincode.trim())) {
      setError("Pincode must be exactly 6 digits.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: form.shopName.trim(),
          shopLogo: shopLogo || undefined,
          shopAddress: form.shopAddress.trim(),
          pincode: form.pincode.trim(),
          ownerName: form.ownerName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          currentRevenue: form.currentRevenue ? Number(form.currentRevenue) : 0,
          itemCategories: ["cafe"]
        })
      });

      const data = (await res.json()) as {
        success: boolean;
        message?: string;
        details?: Array<{ field: string; issue: string }>;
      };

      if (!res.ok || !data.success) {
        const detailMsg = data.details?.length
          ? data.details.map((d) => d.issue).join(" ")
          : "";
        setError(data.message ?? detailMsg ?? "Failed to onboard merchant.");
        return;
      }

      resetForm();
      setSuccess(
        "Merchant created. They can sign in at the merchant app with email and password (OTP required)."
      );
      router.refresh();
      onSuccess?.();
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <form className="onboard-form" onSubmit={submit} noValidate>
      <div className="onboard-grid">
        <div className="onboard-field onboard-field--wide">
          <label htmlFor="shop-name">Shop Name</label>
          <input
            id="shop-name"
            type="text"
            value={form.shopName}
            onChange={(e) => updateField("shopName", e.target.value)}
            placeholder="e.g. Sunrise Cafe"
            required
          />
        </div>

        <div className="onboard-field">
          <label htmlFor="shop-logo">Shop Logo</label>
          <div className="onboard-logo-row">
            {logoPreview ? (
              <div className="onboard-logo-preview">
                <img src={logoPreview} alt="Shop logo preview" />
                <button type="button" className="onboard-logo-clear" onClick={clearLogo}>
                  Remove
                </button>
              </div>
            ) : (
              <input id="shop-logo" type="file" accept="image/*" onChange={onLogoChange} />
            )}
          </div>
        </div>

        <div className="onboard-field onboard-field--wide">
          <label htmlFor="shop-address">Shop Location Address</label>
          <textarea
            id="shop-address"
            rows={3}
            value={form.shopAddress}
            onChange={(e) => updateField("shopAddress", e.target.value)}
            placeholder="Street, area, city, state"
            required
          />
        </div>

        <div className="onboard-field">
          <label htmlFor="pincode">Pincode</label>
          <input
            id="pincode"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={form.pincode}
            onChange={(e) => updateField("pincode", e.target.value.replace(/\D/g, ""))}
            placeholder="400001"
            required
          />
        </div>

        <div className="onboard-field">
          <label htmlFor="owner-name">Shop Owner Name</label>
          <input
            id="owner-name"
            type="text"
            value={form.ownerName}
            onChange={(e) => updateField("ownerName", e.target.value)}
            placeholder="Full name"
            required
          />
        </div>

        <div className="onboard-field">
          <label htmlFor="merchant-email">Email Id</label>
          <input
            id="merchant-email"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="owner@cafe.in"
            required
            autoComplete="off"
          />
        </div>

        <div className="onboard-field">
          <label htmlFor="merchant-password">Password</label>
          <input
            id="merchant-password"
            type="password"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Min. 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div className="onboard-field">
          <label htmlFor="current-revenue">Current Revenue (INR)</label>
          <input
            id="current-revenue"
            type="number"
            min={0}
            step="0.01"
            value={form.currentRevenue}
            onChange={(e) => updateField("currentRevenue", e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="onboard-field onboard-field--wide">
          <p className="onboard-hint">Category: Cafe (platform default)</p>
        </div>
      </div>

      {error && (
        <div className="onboard-alert onboard-alert--error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="onboard-alert onboard-alert--success" role="status">
          {success}
        </div>
      )}

      <div className="onboard-actions">
        <button type="submit" className="dash-btn dash-btn--primary" disabled={loading}>
          {loading ? "Saving..." : "Add Merchant"}
        </button>
      </div>
    </form>
  );

  if (compact) return formContent;

  return (
    <section className="onboard-panel">
      <div className="onboard-panel-head">
        <div>
          <p className="dash-eyebrow">Merchant Onboarding</p>
          <h2 className="onboard-title">Add New Merchant</h2>
          <p className="onboard-subtitle">
            Register a cafe with owner credentials. Starter templates are assigned automatically.
          </p>
        </div>
      </div>
      {formContent}
    </section>
  );
}
