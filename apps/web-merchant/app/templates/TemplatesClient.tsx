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
}

const GROUP_LABELS: Record<string, string> = {
  first_visit: "First Visit",
  second_visit: "Second Visit",
  third_visit: "Third Visit",
  fourth_visit: "Fourth Visit"
};

const DAY_LABELS: Record<string, string> = {
  day_0: "Day 0",
  day_3: "Day 3",
  day_7: "Day 7",
  day_14: "Day 14"
};

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

  const editing = lifecycleTemplates.find((t) => t.id === editId);

  return (
    <>
      <header className="merchant-page-header">
        <div>
          <p className="merchant-eyebrow">Messaging</p>
          <h1>Lifecycle Templates</h1>
          <p className="merchant-muted">
            Automated WhatsApp messages by visit tier. Day 0 sends 5 minutes after a visit.
          </p>
        </div>
        <div className="merchant-page-header-actions">
          <button type="button" className="merchant-btn merchant-btn--primary" onClick={openCreate}>
            + Create Template
          </button>
        </div>
      </header>

      {lifecycleTemplates.length === 0 ? (
        <p className="merchant-muted">
          No lifecycle templates assigned. Contact admin or run lifecycle template seed.
        </p>
      ) : (
        <div className="merchant-lifecycle-groups">
          {GROUP_ORDER.map((groupKey) => {
            const items = grouped.get(groupKey);
            if (!items?.length) return null;
            return (
              <section key={groupKey} className="merchant-panel merchant-lifecycle-group">
                <h2>{GROUP_LABELS[groupKey]}</h2>
                <div className="merchant-lifecycle-milestones">
                  {items.map((t) => (
                    <article key={t.id} className="merchant-lifecycle-card">
                      <div className="merchant-lifecycle-card-head">
                        <h3>{DAY_LABELS[t.lifecycleDay ?? ""] ?? t.lifecycleDay}</h3>
                        <span className="merchant-muted">{t.name}</span>
                      </div>
                      {t.headerImageUrl && (
                        <img
                          src={t.headerImageUrl}
                          alt=""
                          className="merchant-lifecycle-thumb"
                        />
                      )}
                      {t.headerText && (
                        <p className="merchant-template-header">{t.headerText}</p>
                      )}
                      <p>{t.body}</p>
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
          <h2>Custom Templates</h2>
          <p className="merchant-muted">One-off templates for campaigns and manual sends.</p>
          <div className="merchant-custom-template-list">
            {customTemplates.map((t) => (
              <article key={t.id} className="merchant-lifecycle-card">
                <div className="merchant-lifecycle-card-head">
                  <h3>{t.name}</h3>
                </div>
                {t.headerText && <p className="merchant-template-header">{t.headerText}</p>}
                <p>{t.body}</p>
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
            <h2>Create Template</h2>
            <p className="merchant-hint">Custom template for campaigns. Lifecycle templates are assigned by admin.</p>
            <label>
              Template name
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g. Weekend offer"
              />
            </label>
            <label>
              Header
              <input
                value={createForm.headerText}
                onChange={(e) => setCreateForm({ ...createForm, headerText: e.target.value })}
              />
            </label>
            <label>
              Body
              <textarea
                rows={4}
                value={createForm.body}
                onChange={(e) => setCreateForm({ ...createForm, body: e.target.value })}
                placeholder="Hi {{name}}, ..."
              />
            </label>
            <label>
              Footer
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
                {loading ? "Creating..." : "Create Template"}
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
              Edit — {GROUP_LABELS[editing.visitGroup ?? ""]} /{" "}
              {DAY_LABELS[editing.lifecycleDay ?? ""]}
            </h2>
            <p className="merchant-hint">Meta template name: {editing.name}</p>
            <label>
              Header
              <input
                value={form.headerText}
                onChange={(e) => setForm({ ...form, headerText: e.target.value })}
              />
            </label>
            <label>
              Body
              <textarea
                rows={4}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>
            <label>
              Footer
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
