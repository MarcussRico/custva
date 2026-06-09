"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Campaign {
  id: string;
  campaignName: string;
  status: string;
  targetCount: number;
  sentCount?: number;
  deliveredCount?: number;
  failedCount?: number;
}

interface TemplateOption {
  id: string;
  name: string;
}

interface CustomerOption {
  id: string;
  name: string;
  mobile: string;
}

export function CampaignsClient({
  campaigns,
  templates
}: {
  campaigns: Campaign[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [form, setForm] = useState({
    campaignName: "",
    templateId: "",
    inactiveDaysGte: "",
    minSpend: "",
    pincode: "",
    tag: "",
    scheduledAt: "",
    manualIncludeIds: [] as string[]
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);

  const audienceRules = () => ({
    ...(form.inactiveDaysGte ? { inactiveDaysGte: Number(form.inactiveDaysGte) } : {}),
    ...(form.minSpend ? { minSpend: Number(form.minSpend) } : {}),
    ...(form.pincode ? { pincode: form.pincode } : {}),
    ...(form.tag ? { tags: [form.tag] } : {})
  });

  const searchCustomers = async () => {
    const params = new URLSearchParams({ limit: "20", q: customerSearch });
    const res = await fetch(`/api/customers?${params}`);
    const json = (await res.json()) as { success: boolean; data?: { items: CustomerOption[] } };
    if (json.success && json.data) setCustomerResults(json.data.items);
  };

  const createCampaign = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: form.campaignName,
          templateId: form.templateId,
          audienceRules: audienceRules(),
          manualIncludeIds: form.manualIncludeIds,
          manualExcludeIds: [],
          ...(form.scheduledAt ? { scheduledAt: new Date(form.scheduledAt).toISOString() } : {})
        })
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        alert(data.message ?? "Failed to create campaign.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const previewAudience = async (campaignId: string) => {
    const res = await fetch(`/api/campaigns/${campaignId}/preview`, { method: "POST" });
    const json = (await res.json()) as { success: boolean; data?: { count: number } };
    if (json.success && json.data) setPreviewCount(json.data.count);
  };

  const sendCampaign = async (campaignId: string) => {
    if (!confirm("Send campaign now to matched audience?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
      const data = (await res.json()) as { success: boolean; message?: string; data?: { queuedRecipients: number } };
      if (!res.ok || !data.success) {
        alert(data.message ?? "Failed to send.");
        return;
      }
      alert(`Queued ${data.data?.queuedRecipients ?? 0} messages.`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const scheduleCampaign = async (campaignId: string, scheduledAt: string) => {
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "schedule", scheduledAt: new Date(scheduledAt).toISOString() })
    });
    if (!res.ok) alert("Failed to schedule.");
    else router.refresh();
  };

  const toggleManualInclude = (id: string) => {
    setForm((prev) => ({
      ...prev,
      manualIncludeIds: prev.manualIncludeIds.includes(id)
        ? prev.manualIncludeIds.filter((x) => x !== id)
        : [...prev.manualIncludeIds, id]
    }));
  };

  return (
    <>
      <header className="merchant-page-header">
        <div>
          <p className="merchant-eyebrow">WhatsApp</p>
          <h1>Campaigns</h1>
        </div>
      </header>

      <section className="merchant-panel">
        <h2>Create Campaign</h2>
        {templates.length === 0 ? (
          <p className="merchant-muted">Add templates first.</p>
        ) : (
          <div className="merchant-form-grid">
            <label>Campaign name<input value={form.campaignName} onChange={(e) => setForm({ ...form, campaignName: e.target.value })} /></label>
            <label>Template
              <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
                <option value="">Select template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>Inactive days (filter)<input type="number" value={form.inactiveDaysGte} onChange={(e) => setForm({ ...form, inactiveDaysGte: e.target.value })} /></label>
            <label>Min spend<input type="number" value={form.minSpend} onChange={(e) => setForm({ ...form, minSpend: e.target.value })} /></label>
            <label>Pincode<input maxLength={6} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} /></label>
            <label>Auto tag
              <select value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
                <option value="">Any</option>
                <option value="Inactive">Inactive</option>
                <option value="High-value">High-value</option>
                <option value="Repeat">Repeat</option>
                <option value="New">New</option>
              </select>
            </label>
            <label>Schedule (optional)<input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></label>
            <div className="merchant-form-wide">
              <p className="merchant-hint">Manual include (optional)</p>
              <div className="merchant-inline-row">
                <input placeholder="Search customers" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
                <button type="button" className="merchant-btn merchant-btn--secondary" onClick={() => void searchCustomers()}>Search</button>
              </div>
              <div className="merchant-manual-list">
                {customerResults.map((c) => (
                  <label key={c.id} className="merchant-check-row">
                    <input type="checkbox" checked={form.manualIncludeIds.includes(c.id)} onChange={() => toggleManualInclude(c.id)} />
                    {c.name} — {c.mobile}
                  </label>
                ))}
              </div>
            </div>
            <div className="merchant-form-actions">
              <button type="button" className="merchant-btn merchant-btn--primary" disabled={loading || !form.campaignName || !form.templateId} onClick={() => void createCampaign()}>
                Create Campaign
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="merchant-panel">
        <h2>Your Campaigns</h2>
        {previewCount != null && <p className="merchant-success">Preview audience: {previewCount} customers</p>}
        {campaigns.length === 0 ? (
          <p className="merchant-muted">No campaigns yet.</p>
        ) : (
          <div className="merchant-campaign-list">
            {campaigns.map((c) => (
              <article key={c.id} className="merchant-campaign-card">
                <h3>{c.campaignName}</h3>
                <p>Status: {c.status} · Target: {c.targetCount} · Sent: {c.sentCount ?? 0} · Delivered: {c.deliveredCount ?? 0}</p>
                <div className="merchant-form-actions">
                  <button type="button" className="merchant-btn merchant-btn--secondary" onClick={() => void previewAudience(c.id)}>Preview</button>
                  <button type="button" className="merchant-btn merchant-btn--primary" disabled={loading} onClick={() => void sendCampaign(c.id)}>Send Now</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
