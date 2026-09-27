"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CampaignResults } from "./CampaignResults";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Campaign {
  id: string;
  campaignName: string;
  status: string;
  targetCount: number;
  sentCount?: number;
  deliveredCount?: number;
  failedCount?: number;
  holdoutCount?: number;
  scheduledAt?: string | null;
  createdAt?: string;
  /* Per-recipient outcomes (migration 0024). Null for campaigns that ran
     before the dispatch ledger existed. */
  dispatch?: Record<string, number> | null;
}

const DISPATCH_LABEL: Record<string, string> = {
  sent: "sent",
  skipped: "skipped",
  failed: "failed",
  pending: "not sent yet",
  /* A claim taken but never settled: the worker died between claiming a
     recipient and sending to them. Deliberately never retried — missing one
     message is recoverable, sending two is not — so it is named rather than
     hidden among the failures. */
  sending: "interrupted"
};

/* Plain words for a shop owner, not the column value. */
function statusLine(c: Campaign): string {
  const when = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit"
        })
      : "";
  switch (c.status) {
    case "draft":
      return "Not sent yet";
    case "scheduled":
      return `Will send ${when(c.scheduledAt)}`;
    case "sending":
      return "Sending now";
    case "sent":
      /* No send timestamp is stored (updated_at moves with every receipt), so
         this does not pretend to know one. */
      return "Sent";
    default:
      return c.status;
  }
}

/** "3 sent · 1 skipped · 1 failed" — what actually happened to each person. */
function DispatchBreakdown({ dispatch }: { dispatch?: Record<string, number> | null }) {
  if (!dispatch) return null;
  const parts = ["sent", "skipped", "failed", "sending", "pending"]
    .filter((k) => dispatch[k])
    .map((k) => `${dispatch[k]} ${DISPATCH_LABEL[k]}`);
  if (!parts.length) return null;
  return <p className="merchant-dispatch-breakdown">{parts.join(" · ")}</p>;
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

/** The behavioural segments — each customer's own rhythm, not a global cut-off. */
const SEGMENTS = [
  { key: "at_risk", label: "Overdue", hint: "past their own usual gap" },
  { key: "dormant", label: "Long gone", hint: "well past it" },
  { key: "first_time", label: "First visit", hint: "been once" },
  { key: "loyal", label: "On schedule", hint: "coming back as normal" }
] as const;

const SEGMENT_LABEL: Record<string, string> = {
  at_risk: "Overdue",
  dormant: "Long gone",
  first_time: "First visit",
  loyal: "On schedule",
  unclassified: "No rhythm yet"
};

interface AudiencePreview {
  count: number;
  bySegment: Record<string, number>;
  excluded: { noConsentRecord: number; askedToStop: number };
  sample: Array<{ id: string; name: string; mobile: string; segment: string | null }>;
}

/**
 * What the current rules actually match, before anything is committed.
 *
 * Reports three things a merchant needs and previously could not see: how many
 * people, which segments they fall into, and how many of them can lawfully be
 * messaged. "42 matched" and "42 will be messaged" are different numbers
 * whenever some have no consent record, and quietly conflating them is how a
 * shop ends up sending to people who never agreed.
 */
function AudienceSummary({
  preview,
  loading
}: {
  preview: AudiencePreview | null;
  loading: boolean;
}) {
  if (loading && !preview) return <p className="merchant-muted">Counting…</p>;
  if (!preview) return null;

  if (preview.count === 0) {
    /* "No customers match" is wrong and demoralising when in fact plenty
       matched and every one of them was held back by the consent gate. */
    const held = preview.excluded.noConsentRecord;
    return (
      <p className="merchant-audience-summary merchant-audience-summary--empty">
        {held > 0
          ? `${held} customer${held === 1 ? "" : "s"} match these rules, but none of them have a consent record yet, so nothing would be sent.`
          : "No customers match these rules. Nothing would be sent."}
      </p>
    );
  }

  const breakdown = Object.entries(preview.bySegment)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${n} ${SEGMENT_LABEL[key] ?? key}`)
    .join(" · ");

  return (
    <div className="merchant-audience-summary">
      <strong>
        {preview.count.toLocaleString("en-IN")} customer
        {preview.count === 1 ? "" : "s"} match
      </strong>
      <span>{breakdown}</span>
      {/* Why the number may be smaller than the shop expects. Customers with
          no consent record are excluded from every send, so saying nothing
          here would leave the count looking like a bug. */}
      {preview.excluded.noConsentRecord > 0 && (
        <small>
          {preview.excluded.noConsentRecord} more match these rules but have no consent record, so
          they are left out. Tick the consent box next time they come in.
        </small>
      )}
    </div>
  );
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
    /* FR-I1 targeting. The API has accepted these since Phase C; the builder
       never sent them, so every campaign fell back to the legacy global
       thresholds the segments exist to replace. */
    segments: [] as string[],
    overdueOnly: false,
    scheduledAt: "",
    manualIncludeIds: [] as string[]
  });
  /* The dashboard links here with an audience already chosen — "message the
     overdue customers" has to arrive with those customers selected, not with an
     empty form and a note about what to pick. */
  const search = useSearchParams();
  const prefill = useMemo(() => {
    const raw = (search.get("segments") ?? "").split(",").filter(Boolean);
    return {
      segments: raw.filter((r) => SEGMENTS.some((s) => s.key === r)),
      overdueOnly: search.get("overdueOnly") === "1"
    };
  }, [search]);

  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  /* Results are opened per campaign rather than loaded for all of them: the
     lift query is a range scan over visits per recipient, and most cards are
     not being looked at. */
  const [openResults, setOpenResults] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);

  const audienceRules = useCallback(
    () => ({
      ...(form.inactiveDaysGte ? { inactiveDaysGte: Number(form.inactiveDaysGte) } : {}),
      ...(form.minSpend ? { minSpend: Number(form.minSpend) } : {}),
      ...(form.pincode ? { pincode: form.pincode } : {}),
      ...(form.tag ? { tags: [form.tag] } : {}),
      ...(form.segments.length ? { segments: form.segments } : {}),
      ...(form.overdueOnly ? { overdueOnly: true } : {})
    }),
    [form.inactiveDaysGte, form.minSpend, form.pincode, form.tag, form.segments, form.overdueOnly]
  );

  const toggleSegment = (key: string) => {
    setForm((prev) => ({
      ...prev,
      segments: prev.segments.includes(key)
        ? prev.segments.filter((s) => s !== key)
        : [...prev.segments, key]
    }));
  };

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
    if (!confirm("Send this message now to everyone it matches?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
      const data = (await res.json()) as { success: boolean; message?: string; data?: { queuedRecipients: number } };
      if (!res.ok || !data.success) {
        alert(data.message ?? "Failed to send.");
        return;
      }
      alert(`Sending to ${data.data?.queuedRecipients ?? 0} people now.`);
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

  /* Applied once, on arrival. Kept out of useState's initialiser so a later
     navigation with different params still takes effect. */
  useEffect(() => {
    if (!prefill.segments.length && !prefill.overdueOnly) return;
    setForm((prev) => ({
      ...prev,
      segments: prefill.segments,
      overdueOnly: prefill.overdueOnly
    }));
  }, [prefill]);

  /* Counting the audience as the rules change is the whole point of targeting
     by segment: "at risk" means nothing until you can see it is 12 people and
     not 400. Before this the only preview ran *after* the campaign was created,
     so a merchant committed to an audience they had never seen. */
  useEffect(() => {
    const rules = audienceRules();
    const timer = setTimeout(() => {
      setAudienceLoading(true);
      void fetch("/api/campaigns/preview-audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audienceRules: rules, manualIncludeIds: form.manualIncludeIds })
      })
        .then((res) => res.json())
        .then((json: { success: boolean; data?: AudiencePreview }) => {
          setAudience(json.success && json.data ? json.data : null);
        })
        .catch(() => setAudience(null))
        .finally(() => setAudienceLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [audienceRules, form.manualIncludeIds]);

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
          <p className="merchant-muted">
            Send one message to a group — for example everyone who has not come in for a while.
          </p>
        </div>
      </header>

      <section className="merchant-panel">
        <h2>New campaign</h2>
        {templates.length === 0 ? (
          <p className="merchant-muted">
            Write a message first on the Messages page, then come back here to choose who gets it.
          </p>
        ) : (
          <div className="merchant-form-grid">
            <label>Campaign name (only you see this)<input value={form.campaignName} onChange={(e) => setForm({ ...form, campaignName: e.target.value })} /></label>
            <label>Message
              <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
                <option value="">Choose a message</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            {/* Targeting by rhythm comes first, and spans the grid, because it
                is the reason to send at all. The spend/pincode/tag filters
                below narrow it; they are not the starting point. */}
            <div className="merchant-form-wide merchant-audience-pick">
              <p className="merchant-hint">Who to message</p>
              <div className="merchant-segment-choices">
                {SEGMENTS.map((seg) => (
                  <label key={seg.key} className="merchant-segment-choice">
                    <input
                      type="checkbox"
                      checked={form.segments.includes(seg.key)}
                      onChange={() => toggleSegment(seg.key)}
                    />
                    <span>
                      <strong>{seg.label}</strong>
                      <small>{seg.hint}</small>
                    </span>
                  </label>
                ))}
              </div>
              <label className="merchant-filter-check merchant-overdue-toggle">
                <input
                  type="checkbox"
                  checked={form.overdueOnly}
                  onChange={(e) => setForm({ ...form, overdueOnly: e.target.checked })}
                />
                <span>Only people who are late right now, by their own habit</span>
              </label>
              <AudienceSummary preview={audience} loading={audienceLoading} />
            </div>

            <label>Not visited for at least (days)<input type="number" value={form.inactiveDaysGte} onChange={(e) => setForm({ ...form, inactiveDaysGte: e.target.value })} /></label>
            <label>Spent at least (₹)<input type="number" value={form.minSpend} onChange={(e) => setForm({ ...form, minSpend: e.target.value })} /></label>
            <label>Area pincode<input maxLength={6} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} /></label>
            <label>Type of customer
              <select value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
                <option value="">Anyone</option>
                <option value="Inactive">Not seen in 30+ days</option>
                <option value="High-value">Big spenders (₹2,000+)</option>
                <option value="Repeat">Came more than once</option>
                <option value="New">Came once</option>
              </select>
            </label>
            <label>Send later (optional)<input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></label>
            <div className="merchant-form-wide">
              <p className="merchant-hint">Also add these people (optional)</p>
              <div className="merchant-inline-row">
                <input placeholder="Name or phone" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
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
                Save campaign
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="merchant-panel">
        <h2>Your campaigns</h2>
        {previewCount != null && <p className="merchant-success">This campaign would reach {previewCount} people.</p>}
        {campaigns.length === 0 ? (
          <p className="merchant-muted">No campaigns yet.</p>
        ) : (
          <div className="merchant-campaign-list">
            {campaigns.map((c) => (
              <article key={c.id} className="merchant-campaign-card">
                <h3>{c.campaignName}</h3>
                <p className="merchant-campaign-line">
                  <strong>{statusLine(c)}</strong>
                  {c.status !== "draft" && c.status !== "scheduled" ? (
                    <>
                      {" · "}
                      {c.deliveredCount ?? 0} reached their phone
                      {c.holdoutCount ? ` · ${c.holdoutCount} deliberately not messaged, to measure the effect` : ""}
                    </>
                  ) : (
                    <> · {c.targetCount} people</>
                  )}
                </p>
                <DispatchBreakdown dispatch={c.dispatch} />
                <div className="merchant-form-actions">
                  {(c.status === "draft" || c.status === "scheduled") && (
                    <button type="button" className="merchant-btn merchant-btn--secondary" onClick={() => void previewAudience(c.id)}>Who will get it</button>
                  )}
                  <button
                    type="button"
                    className="merchant-btn merchant-btn--secondary"
                    onClick={() => setOpenResults(openResults === c.id ? null : c.id)}
                  >
                    {openResults === c.id ? "Hide results" : "Did it work?"}
                  </button>
                  {/* Only a campaign that has not gone out can be sent. The API
                      already refused a second send with a 409; the button just
                      offered it anyway. */}
                  {(c.status === "draft" || c.status === "scheduled") && (
                    <button type="button" className="merchant-btn merchant-btn--primary" disabled={loading} onClick={() => void sendCampaign(c.id)}>Send now</button>
                  )}
                </div>
                {openResults === c.id && <CampaignResults campaignId={c.id} />}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
