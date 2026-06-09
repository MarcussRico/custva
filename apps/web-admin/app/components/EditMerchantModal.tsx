"use client";

import { useEffect, useState } from "react";
import type { MerchantRow } from "./MerchantsPageClient";

export function EditMerchantModal({
  merchant,
  open,
  onClose,
  onSaved
}: {
  merchant: MerchantRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    shopName: "",
    ownerName: "",
    email: "",
    shopAddress: "",
    pincode: "",
    currentRevenue: "",
    password: "",
    status: "active"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!merchant || !open) return;
    setForm({
      shopName: merchant.shopName,
      ownerName: merchant.ownerName,
      email: merchant.email,
      shopAddress: merchant.shopAddress,
      pincode: merchant.pincode,
      currentRevenue: String(merchant.currentRevenue ?? 0),
      password: "",
      status: merchant.status
    });
    setError("");
  }, [merchant, open]);

  if (!open || !merchant) return null;

  const save = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/merchants/${merchant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: form.shopName.trim(),
          ownerName: form.ownerName.trim(),
          email: form.email.trim(),
          shopAddress: form.shopAddress.trim(),
          pincode: form.pincode.trim(),
          currentRevenue: Number(form.currentRevenue) || 0,
          status: form.status,
          ...(form.password ? { password: form.password } : {})
        })
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to update merchant.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Connection error.");
    } finally {
      setLoading(false);
    }
  };

  const suspend = async () => {
    setLoading(true);
    try {
      await fetch(`/api/admin/merchants/${merchant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended", reason: "Admin suspended" })
      });
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <header className="modal-header">
          <div>
            <p className="dash-eyebrow">Edit Merchant</p>
            <h2 className="modal-title">{merchant.shopName}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <div className="onboard-grid">
            <div className="onboard-field onboard-field--wide">
              <label>Shop Name</label>
              <input
                value={form.shopName}
                onChange={(e) => setForm({ ...form, shopName: e.target.value })}
              />
            </div>
            <div className="onboard-field">
              <label>Owner Name</label>
              <input
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              />
            </div>
            <div className="onboard-field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="onboard-field onboard-field--wide">
              <label>Address</label>
              <textarea
                rows={2}
                value={form.shopAddress}
                onChange={(e) => setForm({ ...form, shopAddress: e.target.value })}
              />
            </div>
            <div className="onboard-field">
              <label>Pincode</label>
              <input
                value={form.pincode}
                onChange={(e) =>
                  setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                }
              />
            </div>
            <div className="onboard-field">
              <label>Revenue (INR)</label>
              <input
                type="number"
                value={form.currentRevenue}
                onChange={(e) => setForm({ ...form, currentRevenue: e.target.value })}
              />
            </div>
            <div className="onboard-field">
              <label>Status</label>
              <select
                className="onboard-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="onboard-field">
              <label>Reset Password (optional)</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Leave blank to keep"
              />
            </div>
          </div>
          {error && <div className="onboard-alert onboard-alert--error">{error}</div>}
          <div className="onboard-actions">
            <button
              type="button"
              className="dash-btn dash-btn--secondary"
              onClick={suspend}
              disabled={loading}
            >
              Suspend
            </button>
            <button
              type="button"
              className="dash-btn dash-btn--primary"
              onClick={save}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
