"use client";

import { useCallback, useEffect, useState } from "react";
import type { MerchantRow } from "./MerchantsPageClient";

export function AssignTemplateModal({
  templateId,
  open,
  onClose,
  onAssigned
}: {
  templateId: string | null;
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useFilter, setUseFilter] = useState(false);
  const [filterQ, setFilterQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterPincode, setFilterPincode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMerchants = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", limit: "100", status: "active" });
    const res = await fetch(`/api/admin/merchants?${params}`);
    const json = (await res.json()) as {
      success: boolean;
      data?: { items: MerchantRow[] };
    };
    if (json.success && json.data) setMerchants(json.data.items);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setError("");
    setMessage("");
    void loadMerchants();
  }, [open, loadMerchants]);

  if (!open || !templateId) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const assign = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const body = useFilter
        ? {
            selectAll: true,
            filter: {
              q: filterQ.trim() || undefined,
              status: filterStatus || undefined,
              pincode: filterPincode.trim() || undefined
            }
          }
        : { merchantIds: Array.from(selected) };

      if (!useFilter && selected.size === 0) {
        setError("Select at least one merchant.");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/templates/${templateId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: { assigned?: number; async?: boolean; jobId?: string; merchantCount?: number };
      };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Assign failed.");
        return;
      }
      if (data.data?.async) {
        setMessage(`Bulk job queued (${data.data.merchantCount} merchants). Job: ${data.data.jobId}`);
      } else {
        setMessage(`Assigned to ${data.data?.assigned ?? 0} merchant(s).`);
      }
      onAssigned();
    } catch {
      setError("Connection error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <header className="modal-header">
          <div>
            <p className="dash-eyebrow">Assign Template</p>
            <h2 className="modal-title">Fork to merchants</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <label className="onboard-checkbox-label">
            <input type="checkbox" checked={useFilter} onChange={(e) => setUseFilter(e.target.checked)} />
            Assign to all merchants matching filter
          </label>

          {useFilter ? (
            <div className="dash-filters dash-filters--compact">
              <input
                className="dash-filter-input"
                placeholder="Search..."
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
              />
              <select
                className="dash-filter-input"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <input
                className="dash-filter-input"
                placeholder="Pincode"
                value={filterPincode}
                onChange={(e) => setFilterPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
          ) : (
            <div className="assign-merchant-list">
              {merchants.map((m) => (
                <label key={m.id} className="assign-merchant-row">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                  <span>
                    {m.shopName} — {m.email}
                  </span>
                </label>
              ))}
            </div>
          )}

          {error && <div className="onboard-alert onboard-alert--error">{error}</div>}
          {message && <div className="onboard-alert onboard-alert--success">{message}</div>}

          <div className="onboard-actions">
            <button type="button" className="dash-btn dash-btn--primary" onClick={assign} disabled={loading}>
              {loading ? "Assigning..." : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
