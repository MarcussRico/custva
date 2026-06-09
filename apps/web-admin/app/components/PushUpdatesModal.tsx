"use client";

import { useEffect, useState } from "react";
import type { TemplateAssignment } from "./template-types";

export function PushUpdatesModal({
  templateId,
  open,
  onClose,
  onPushed
}: {
  templateId: string | null;
  open: boolean;
  onClose: () => void;
  onPushed: () => void;
}) {
  const [assignments, setAssignments] = useState<TemplateAssignment[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || !templateId) return;
    setError("");
    setMessage("");
    setSelected(new Set());
    void (async () => {
      const res = await fetch(`/api/admin/templates/${templateId}/assignments`);
      const json = (await res.json()) as {
        success: boolean;
        data?: { items: TemplateAssignment[] };
      };
      if (json.success && json.data) setAssignments(json.data.items);
    })();
  }, [open, templateId]);

  if (!open || !templateId) return null;

  const toggle = (merchantId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(merchantId)) next.delete(merchantId);
      else next.add(merchantId);
      return next;
    });
  };

  const push = async () => {
    if (selected.size === 0) {
      setError("Select at least one merchant.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/templates/${templateId}/push-updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantIds: Array.from(selected), force })
      });
      const data = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: { updated?: number; skipped?: number; async?: boolean; jobId?: string };
      };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Push failed.");
        return;
      }
      if (data.data?.async) {
        setMessage(`Bulk push queued. Job: ${data.data.jobId}`);
      } else {
        setMessage(`Updated ${data.data?.updated ?? 0}, skipped ${data.data?.skipped ?? 0}.`);
      }
      onPushed();
    } catch {
      setError("Connection error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-dialog modal-dialog--wide" onClick={(e) => e.stopPropagation()} role="dialog">
        <header className="modal-header">
          <div>
            <p className="dash-eyebrow">Push Updates</p>
            <h2 className="modal-title">Sync merchant copies from global master</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="onboard-hint">
            Copies with local edits are skipped unless you enable force overwrite.
          </p>
          <label className="onboard-checkbox-label">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Force overwrite locally modified copies
          </label>
          <div className="assign-merchant-list">
            {assignments.map((a) => (
              <label key={a.merchantId} className="assign-merchant-row">
                <input
                  type="checkbox"
                  checked={selected.has(a.merchantId)}
                  onChange={() => toggle(a.merchantId)}
                />
                <span>
                  {a.shopName} — v{a.sourceVersion}/{a.globalVersion}
                  {a.hasVersionDrift && <em className="drift-badge"> drift</em>}
                  {a.isLocallyModified && <em className="modified-badge"> modified</em>}
                </span>
              </label>
            ))}
            {assignments.length === 0 && <p className="dash-empty">No assigned merchants yet.</p>}
          </div>
          {error && <div className="onboard-alert onboard-alert--error">{error}</div>}
          {message && <div className="onboard-alert onboard-alert--success">{message}</div>}
          <div className="onboard-actions">
            <button type="button" className="dash-btn dash-btn--primary" onClick={push} disabled={loading}>
              {loading ? "Pushing..." : "Push Updates"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
