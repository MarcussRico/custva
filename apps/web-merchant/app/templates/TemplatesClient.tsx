"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export interface MerchantTemplate {
  id: string;
  name: string;
  body: string;
  headerText: string | null;
  footerText: string | null;
  headerImageUrl: string | null;
  languageCode: string;
  visitGroup: string | null;
  lifecycleDay: string | null;
  buttons: Array<{ type: string; text: string; value: string }>;
  sourceTemplateId: string | null;
  isLocallyModified: boolean;
  metaStatus?: string | null;
  metaRejectedReason?: string | null;
}

/* Whether WhatsApp will actually deliver this wording. Meta approves each
   message's exact text; until it has, nothing is sent, and a shop owner needs
   to know that without reading the word "Meta". */
function ApprovalChip({ t }: { t: MerchantTemplate }) {
  const status = (t.metaStatus ?? "").toUpperCase();
  if (status === "APPROVED") {
    return <span className="tpl-chip tpl-chip--ok">Approved by WhatsApp</span>;
  }
  if (status === "REJECTED") {
    return (
      <span className="tpl-chip tpl-chip--bad" title={t.metaRejectedReason ?? undefined}>
        Rejected by WhatsApp
      </span>
    );
  }
  if (status) return <span className="tpl-chip tpl-chip--wait">Waiting for WhatsApp approval</span>;
  return <span className="tpl-chip tpl-chip--wait">Not approved yet — will not send</span>;
}

/* Placeholders shown as what they become, not as {{name}} code. */
function WithPlaceholders({ text }: { text: string }) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\{\{(\w+)\}\}$/);
        if (!m) return <span key={i}>{part}</span>;
        const label = m[1] === "name" ? "customer's name" : m[1] === "shop_name" ? "your shop's name" : m[1];
        return (
          <span key={i} className="tpl-var">
            {label}
          </span>
        );
      })}
    </>
  );
}

const GROUP_LABELS: Record<string, string> = {
  first_visit: "After a first visit",
  second_visit: "After a 2nd visit",
  third_visit: "After a 3rd visit",
  fourth_visit: "After a 4th visit and every one after"
};

const GROUP_HINTS: Record<string, string> = {
  first_visit:
    "A new customer has no habit yet, so these go out on a fixed schedule. Any that have not gone yet are cancelled the moment they come back.",
  second_visit:
    "From the second visit on, reminders are timed to this person's own habit — a weekly customer hears from you sooner than a monthly one, and anyone who comes back on time gets no reminder at all.",
  third_visit: "Timed to this person's own habit, as above.",
  fourth_visit: "Timed to this person's own habit, as above."
};

/* When each message actually goes out. The stored keys are day_0/3/7/14, but
   only first-visit customers are on that fixed grid; for everyone else the
   day_7 and day_14 slots fire at 1.25x and 2.5x their own usual gap
   (lifecycle-service.ts buildRhythmPlan) and day_3 is not used. */
function whenSent(group: string, day: string): { label: string; unused?: boolean } {
  if (day === "day_0") return { label: "5 minutes after the visit — a thank-you" };
  if (group === "first_visit") {
    return {
      day_3: { label: "3 days later, if they have not come back" },
      day_7: { label: "7 days later, if they still have not" },
      day_14: { label: "14 days later — the last try" }
    }[day] ?? { label: day };
  }
  return {
    day_3: {
      label: "Not used for returning customers — they get reminders timed to their habit instead",
      unused: true
    },
    day_7: { label: "When they are late by their own habit" },
    day_14: { label: "If they are still away much longer after that" }
  }[day] ?? { label: day };
}

const GROUP_ORDER = ["first_visit", "second_visit", "third_visit", "fourth_visit"];
const DAY_ORDER = ["day_0", "day_3", "day_7", "day_14"];

const EMPTY_CREATE_FORM = {
  name: "",
  body: "",
  headerText: "",
  footerText: ""
};

export function TemplatesClient({ templates }: { templates: MerchantTemplate[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ body: "", headerText: "", footerText: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lifecycleTemplates = useMemo(
    () => templates.filter((t) => t.visitGroup && t.lifecycleDay),
    [templates]
  );

  const customTemplates = useMemo(
    () => templates.filter((t) => !t.visitGroup || !t.lifecycleDay),
    [templates]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, MerchantTemplate[]>();
    for (const group of GROUP_ORDER) {
      const items = lifecycleTemplates
        .filter((t) => t.visitGroup === group)
        .sort(
          (a, b) =>
            DAY_ORDER.indexOf(a.lifecycleDay ?? "") - DAY_ORDER.indexOf(b.lifecycleDay ?? "")
        );
      if (items.length) map.set(group, items);
    }
    return map;
  }, [lifecycleTemplates]);

  const openEdit = (t: MerchantTemplate) => {
    setEditId(t.id);
    setForm({
      body: t.body,
      headerText: t.headerText ?? "",
      footerText: t.footerText ?? ""
    });
    setError("");
  };

  const openCreate = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setError("");
    setCreateOpen(true);
  };

  const saveCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm)
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to create template.");
        return;
      }
      setCreateOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!editId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/templates/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to save.");
        return;
      }
      setEditId(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  /* Looked up across every template. This used to search only the lifecycle
     ones, so "Edit copy" on a campaign message set the id, found nothing, and
     opened no dialog — the button silently did nothing. */
  const editing = templates.find((t) => t.id === editId);

  return (
    <>
      <header className="merchant-page-header">
        <div>
          <p className="merchant-eyebrow">WhatsApp</p>
          <h1>Messages</h1>
          <p className="merchant-muted">
            What your customers receive, and when. Automatic messages go out on their own after
            each visit — nobody at the counter has to send anything.
          </p>
        </div>
        <div className="merchant-page-header-actions">
          <button type="button" className="merchant-btn merchant-btn--primary" onClick={openCreate}>
            + New message for a campaign
          </button>
        </div>
      </header>

      {lifecycleTemplates.length === 0 ? (
        <p className="merchant-muted">
          Your automatic messages have not been set up yet. Custva will add them for you — call
          or WhatsApp +91 63802 88707 if this is still empty after your first day.
        </p>
      ) : (
        <div className="merchant-lifecycle-groups">
          {GROUP_ORDER.map((groupKey) => {
            const items = grouped.get(groupKey);
            if (!items?.length) return null;
            return (
              <section key={groupKey} className="merchant-panel merchant-lifecycle-group">
                <h2>{GROUP_LABELS[groupKey]}</h2>
                <p className="merchant-muted merchant-lifecycle-hint">{GROUP_HINTS[groupKey]}</p>
                <div className="merchant-lifecycle-milestones">
                  {items.map((t) => (
                    <article
                      key={t.id}
                      className={`merchant-lifecycle-card${
                        whenSent(groupKey, t.lifecycleDay ?? "").unused
                          ? " merchant-lifecycle-card--unused"
                          : ""
                      }`}
                    >
                      <div className="merchant-lifecycle-card-head">
                        <h3>{whenSent(groupKey, t.lifecycleDay ?? "").label}</h3>
                        {!whenSent(groupKey, t.lifecycleDay ?? "").unused && <ApprovalChip t={t} />}
                      </div>
                      {t.headerImageUrl && (
                        <img
                          src={t.headerImageUrl}
                          alt=""
                          className="merchant-lifecycle-thumb"
                        />
                      )}
                      {t.headerText && (
                        <p className="merchant-template-header"><WithPlaceholders text={t.headerText} /></p>
                      )}
                      <p><WithPlaceholders text={t.body} /></p>
                      {t.footerText && <small>{t.footerText}</small>}
                      {(t.buttons ?? []).length > 0 && (
                        <div className="merchant-lifecycle-buttons">
                          {t.buttons.map((b, i) => (
                            <span key={i} className="merchant-profile-chip">
                              {b.text}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="merchant-form-actions">
                        <button
                          type="button"
                          className="merchant-btn merchant-btn--secondary"
                          onClick={() => openEdit(t)}
                        >
                          Edit copy
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {customTemplates.length > 0 && (
        <section className="merchant-panel merchant-custom-templates">
          <h2>Messages for campaigns</h2>
          <p className="merchant-muted">
            Your own messages — an offer, a new menu item, a festival special. You choose who gets
            them on the Campaigns page.
          </p>
          <div className="merchant-custom-template-list">
            {customTemplates.map((t) => (
              <article key={t.id} className="merchant-lifecycle-card">
                <div className="merchant-lifecycle-card-head">
                  <h3>{t.name}</h3>
                  <ApprovalChip t={t} />
                </div>
                {t.headerText && <p className="merchant-template-header"><WithPlaceholders text={t.headerText} /></p>}
                <p><WithPlaceholders text={t.body} /></p>
                {t.footerText && <small>{t.footerText}</small>}
                <div className="merchant-form-actions">
                  <button
                    type="button"
                    className="merchant-btn merchant-btn--secondary"
                    onClick={() => openEdit(t)}
                  >
                    Edit copy
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {createOpen && (
        <div
          className="merchant-modal-overlay"
          onClick={() => setCreateOpen(false)}
          role="presentation"
        >
          <div
            className="merchant-modal merchant-modal--wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2>New message for a campaign</h2>
            <p className="merchant-hint">
              Write it the way you would say it at the counter. Put {"{{name}}"} where the
              customer&apos;s first name should go. WhatsApp checks every new message before it can
              be sent, which usually takes a few hours.
            </p>
            <label>
              Name (only you see this)
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g. Weekend offer"
              />
            </label>
            <label>
              Title (optional)
              <input
                value={createForm.headerText}
                onChange={(e) => setCreateForm({ ...createForm, headerText: e.target.value })}
              />
            </label>
            <label>
              Message
              <textarea
                rows={4}
                value={createForm.body}
                onChange={(e) => setCreateForm({ ...createForm, body: e.target.value })}
                placeholder="Hi {{name}}, ..."
              />
            </label>
            <label>
              Small print (optional)
              <input
                value={createForm.footerText}
                onChange={(e) => setCreateForm({ ...createForm, footerText: e.target.value })}
              />
            </label>
            {error && <p className="merchant-error">{error}</p>}
            <div className="merchant-form-actions">
              <button
                type="button"
                className="merchant-btn merchant-btn--secondary"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="merchant-btn merchant-btn--primary"
                onClick={() => void saveCreate()}
                disabled={loading || !createForm.name.trim() || !createForm.body.trim()}
              >
                {loading ? "Saving..." : "Save message"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editId && editing && (
        <div
          className="merchant-modal-overlay"
          onClick={() => setEditId(null)}
          role="presentation"
        >
          <div
            className="merchant-modal merchant-modal--wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2>
              {editing.visitGroup && editing.lifecycleDay
                ? `${GROUP_LABELS[editing.visitGroup] ?? ""} — ${whenSent(editing.visitGroup, editing.lifecycleDay).label}`
                : `Edit “${editing.name}”`}
            </h2>
            <p className="merchant-hint">
              Changing the words means WhatsApp has to approve it again before it sends. Until then
              this message is paused.
            </p>
            <label>
              Title (optional)
              <input
                value={form.headerText}
                onChange={(e) => setForm({ ...form, headerText: e.target.value })}
              />
            </label>
            <label>
              Message
              <textarea
                rows={4}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>
            <label>
              Small print (optional)
              <input
                value={form.footerText}
                onChange={(e) => setForm({ ...form, footerText: e.target.value })}
              />
            </label>
            {error && <p className="merchant-error">{error}</p>}
            <div className="merchant-form-actions">
              <button
                type="button"
                className="merchant-btn merchant-btn--secondary"
                onClick={() => setEditId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="merchant-btn merchant-btn--primary"
                onClick={() => void saveEdit()}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
