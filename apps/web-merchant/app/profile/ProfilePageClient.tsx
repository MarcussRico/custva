"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface MerchantProfile {
  shopName: string;
  ownerName: string;
  email: string;
  shopLogo: string | null;
  shopAddress: string;
  pincode: string | null;
  currentRevenue: number | null;
  itemCategories: string[] | null;
  status: string;
  subscriptionStatus: string | null;
  planCode?: string | null;
}

export function ProfilePageClient({ profile: initial }: { profile: MerchantProfile }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [form, setForm] = useState({
    shopName: initial.shopName,
    ownerName: initial.ownerName,
    email: initial.email,
    shopAddress: initial.shopAddress,
    pincode: initial.pincode ?? "",
    currentRevenue: initial.currentRevenue != null ? String(initial.currentRevenue) : ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [pwdStep, setPwdStep] = useState<"idle" | "otp-sent" | "done">("idle");
  const [pwdOtp, setPwdOtp] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");

  const saveProfile = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/merchants/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: form.shopName.trim(),
          ownerName: form.ownerName.trim(),
          email: form.email.trim(),
          shopAddress: form.shopAddress.trim(),
          pincode: form.pincode.trim() || undefined,
          currentRevenue: form.currentRevenue ? Number(form.currentRevenue) : undefined
        })
      });
      const data = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: MerchantProfile & { emailVerificationRequired?: boolean };
      };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to update profile.");
        return;
      }
      if (data.data) {
        setProfile(data.data);
        setForm({
          shopName: data.data.shopName,
          ownerName: data.data.ownerName,
          email: data.data.email,
          shopAddress: data.data.shopAddress,
          pincode: data.data.pincode ?? "",
          currentRevenue:
            data.data.currentRevenue != null ? String(data.data.currentRevenue) : ""
        });
      }
      setSuccess(
        data.data?.emailVerificationRequired
          ? "Profile saved. Email change may require re-login."
          : "Profile saved successfully."
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordOtp = async () => {
    setPwdLoading(true);
    setPwdError("");
    setPwdSuccess("");
    try {
      const res = await fetch("/api/merchants/me/password/request-otp", { method: "POST" });
      const data = (await res.json()) as { success: boolean; message?: string; email?: string };
      if (!res.ok || !data.success) {
        setPwdError(data.message ?? "Failed to send OTP.");
        return;
      }
      setMaskedEmail(data.email ?? profile.email);
      setPwdStep("otp-sent");
      setPwdSuccess("Verification code sent to your email.");
    } finally {
      setPwdLoading(false);
    }
  };

  const confirmPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdNew !== pwdConfirm) {
      setPwdError("Passwords do not match.");
      return;
    }
    if (pwdNew.length < 8) {
      setPwdError("Password must be at least 8 characters.");
      return;
    }
    setPwdLoading(true);
    setPwdError("");
    setPwdSuccess("");
    try {
      const res = await fetch("/api/merchants/me/password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: pwdOtp.trim(), newPassword: pwdNew })
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        setPwdError(data.message ?? "Failed to update password.");
        return;
      }
      setPwdStep("done");
      setPwdOtp("");
      setPwdNew("");
      setPwdConfirm("");
      setPwdSuccess("Password updated successfully.");
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <>
      <header className="merchant-page-header">
        <div>
          <p className="merchant-eyebrow">Settings</p>
          <h1>Profile</h1>
        </div>
      </header>

      <section className="merchant-panel merchant-profile-section">
        <h2>Shop profile</h2>
        <div className="merchant-form-grid merchant-profile-form">
          <label>
            Status
            <div className="merchant-profile-field-value">
              <span className="merchant-profile-badge">{profile.status}</span>
              {profile.subscriptionStatus && (
                <span className="merchant-profile-badge merchant-profile-badge--muted">
                  {profile.subscriptionStatus}
                  {profile.planCode ? ` · ${profile.planCode}` : ""}
                </span>
              )}
            </div>
          </label>
          <label>
            Categories
            <div className="merchant-profile-field-value">
              {profile.itemCategories && profile.itemCategories.length > 0 ? (
                <div className="merchant-profile-chips">
                  {profile.itemCategories.map((cat) => (
                    <span key={cat} className="merchant-profile-chip">
                      {cat}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="merchant-muted">—</span>
              )}
            </div>
          </label>
          <label>
            Shop name
            <input
              value={form.shopName}
              onChange={(e) => setForm({ ...form, shopName: e.target.value })}
            />
          </label>
          <label>
            Owner name
            <input
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="merchant-form-wide">
            Address
            <textarea
              rows={2}
              value={form.shopAddress}
              onChange={(e) => setForm({ ...form, shopAddress: e.target.value })}
            />
          </label>
          <label>
            Pincode
            <input
              maxLength={6}
              value={form.pincode}
              onChange={(e) =>
                setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })
              }
            />
          </label>
          <label>
            Current revenue (INR)
            <input
              type="number"
              min={0}
              value={form.currentRevenue}
              onChange={(e) => setForm({ ...form, currentRevenue: e.target.value })}
            />
          </label>
        </div>
        <div className="merchant-form-actions">
          <button
            type="button"
            className="merchant-btn merchant-btn--primary"
            onClick={() => void saveProfile()}
            disabled={loading}
          >
            Save profile
          </button>
        </div>
        {error && <p className="merchant-error">{error}</p>}
        {success && <p className="merchant-success">{success}</p>}
      </section>

      <section className="merchant-panel merchant-profile-section">
        <h2>Account security</h2>
        <p className="merchant-muted">Change your login password via email verification.</p>
        {pwdStep === "idle" && (
          <button
            type="button"
            className="merchant-btn merchant-btn--secondary"
            onClick={() => void requestPasswordOtp()}
            disabled={pwdLoading}
          >
            Send verification code
          </button>
        )}
        {(pwdStep === "otp-sent" || pwdStep === "done") && (
          <form className="merchant-profile-password-form" onSubmit={confirmPassword}>
            {maskedEmail && (
              <p className="merchant-hint">Code sent to {maskedEmail}</p>
            )}
            <label>
              Verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={pwdOtp}
                onChange={(e) => setPwdOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={pwdConfirm}
                onChange={(e) => setPwdConfirm(e.target.value)}
                required
                minLength={8}
              />
            </label>
            <div className="merchant-form-actions">
              <button
                type="button"
                className="merchant-btn merchant-btn--secondary"
                onClick={() => void requestPasswordOtp()}
                disabled={pwdLoading}
              >
                Resend code
              </button>
              <button
                type="submit"
                className="merchant-btn merchant-btn--primary"
                disabled={pwdLoading}
              >
                Update password
              </button>
            </div>
          </form>
        )}
        {pwdError && <p className="merchant-error">{pwdError}</p>}
        {pwdSuccess && <p className="merchant-success">{pwdSuccess}</p>}
      </section>
    </>
  );
}
