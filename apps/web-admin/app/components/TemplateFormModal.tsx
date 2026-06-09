"use client";

import { useEffect, useState } from "react";
import type { GlobalTemplate, TemplateButton, TemplateFormState } from "./template-types";
import { EMPTY_TEMPLATE_FORM } from "./template-types";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "ar", label: "Arabic" }
] as const;

const BODY_VARS = ["{{name}}", "{{shop_name}}", "{{visit_count}}"] as const;

const BUTTON_TYPE_LABELS: Record<TemplateButton["type"], string> = {
  quick_reply: "Quick reply",
  url: "URL link",
  phone: "Phone"
};

function renderBodyPreview(body: string) {
  if (!body) return "Message body will appear here…";
  const parts = body.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) =>
    /^\{\{[^}]+\}\}$/.test(part) ? (
      <mark key={i} className="saas-preview-var">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function TemplateFormModal({
  open,
  template,
  onClose,
  onSaved
}: {
  open: boolean;
  template: GlobalTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(
      template
        ? {
            name: template.name,
            headerText: template.headerText ?? "",
            headerImageUrl: template.headerImageUrl ?? "",
            body: template.body,
            footerText: template.footerText ?? "",
            languageCode: template.languageCode ?? "en",
            buttons: Array.isArray(template.buttons) ? template.buttons : [],
            isStarterPack: template.isStarterPack
          }
        : EMPTY_TEMPLATE_FORM
    );
    setError("");
  }, [open, template]);

  if (!open) return null;

  const save = async () => {
    setLoading(true);
    setError("");
    try {
      const url = template ? `/api/admin/templates/${template.id}` : "/api/admin/templates";
      const res = await fetch(url, {
        method: template ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? "Failed to save template.");
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

  const addButton = () => {
    if (form.buttons.length >= 3) return;
    setForm({
      ...form,
      buttons: [...form.buttons, { type: "quick_reply", text: "Reply", value: "reply" }]
    });
  };

  const insertVar = (token: string) => {
    setForm({ ...form, body: form.body ? `${form.body} ${token}` : token });
  };

  const displayTitle = form.name.trim() || "Untitled template";

  return (
    <div className="modal-overlay saas-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog modal-dialog--saas-template"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="template-form-title"
      >
        <header className="saas-modal-header">
          <div className="saas-modal-header-text">
            <p className="dash-eyebrow">{template ? "Edit template" : "New template"}</p>
            <h2 id="template-form-title" className="saas-modal-title">
              {displayTitle}
            </h2>
            <p className="saas-modal-desc">
              Compose a WhatsApp message template. Changes sync to assigned merchants on push.
            </p>
          </div>
          <button type="button" className="saas-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="saas-template-layout">
          <div className="saas-template-form">
            <section className="saas-form-section">
              <div className="saas-form-section-head">
                <h3>Template details</h3>
                <p>Internal name and delivery settings.</p>
              </div>
              <div className="saas-form-grid">
                <div className="saas-field saas-field--full">
                  <label htmlFor="tpl-name">Template name</label>
                  <input
                    id="tpl-name"
                    className="saas-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Welcome back — Day 3"
                  />
                </div>
                <div className="saas-field">
                  <label htmlFor="tpl-lang">Language</label>
                  <select
                    id="tpl-lang"
                    className="saas-select"
                    value={form.languageCode}
                    onChange={(e) => setForm({ ...form, languageCode: e.target.value })}
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="saas-field saas-field--toggle">
                  <label htmlFor="tpl-starter">Starter pack</label>
                  <div className="saas-toggle-row">
                    <button
                      id="tpl-starter"
                      type="button"
                      role="switch"
                      aria-checked={form.isStarterPack}
                      className={`saas-toggle${form.isStarterPack ? " saas-toggle--on" : ""}`}
                      onClick={() => setForm({ ...form, isStarterPack: !form.isStarterPack })}
                    >
                      <span className="saas-toggle-knob" />
                    </button>
                    <span className="saas-toggle-hint">Auto-assign when a merchant is created</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="saas-form-section">
              <div className="saas-form-section-head">
                <h3>Message content</h3>
                <p>Header, body, and footer shown in the WhatsApp bubble.</p>
              </div>
              <div className="saas-form-stack">
                <div className="saas-field">
                  <div className="saas-field-label-row">
                    <label htmlFor="tpl-header-img">Header image</label>
                    <span className="saas-field-optional">Optional</span>
                  </div>
                  <input
                    id="tpl-header-img"
                    className="saas-input"
                    type="url"
                    value={form.headerImageUrl}
                    onChange={(e) => setForm({ ...form, headerImageUrl: e.target.value })}
                    placeholder="https://cdn.example.com/promo.jpg"
                  />
                  <span className="saas-field-hint">Public HTTPS URL for Meta image header.</span>
                </div>
                <div className="saas-field">
                  <div className="saas-field-label-row">
                    <label htmlFor="tpl-header">Header text</label>
                    <span className="saas-char-count">{form.headerText.length}/60</span>
                  </div>
                  <input
                    id="tpl-header"
                    className="saas-input"
                    value={form.headerText}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, headerText: e.target.value })}
                    placeholder="Short headline above the body"
                  />
                </div>
                <div className="saas-field">
                  <div className="saas-field-label-row">
                    <label htmlFor="tpl-body">Body</label>
                    <span className="saas-char-count">{form.body.length}/4096</span>
                  </div>
                  <textarea
                    id="tpl-body"
                    className="saas-textarea"
                    rows={6}
                    value={form.body}
                    maxLength={4096}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="Hi {{name}}, thanks for visiting {{shop_name}}!"
                    required
                  />
                  <div className="saas-var-chips">
                    <span className="saas-var-chips-label">Insert variable:</span>
                    {BODY_VARS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="saas-var-chip"
                        onClick={() => insertVar(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="saas-field">
                  <div className="saas-field-label-row">
                    <label htmlFor="tpl-footer">Footer</label>
                    <span className="saas-char-count">{form.footerText.length}/60</span>
                  </div>
                  <input
                    id="tpl-footer"
                    className="saas-input"
                    value={form.footerText}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, footerText: e.target.value })}
                    placeholder="e.g. Reply STOP to unsubscribe"
                  />
                </div>
              </div>
            </section>

            <section className="saas-form-section">
              <div className="saas-form-section-head">
                <div>
                  <h3>Action buttons</h3>
                  <p>Up to three quick replies, links, or phone actions.</p>
                </div>
                <button
                  type="button"
                  className="saas-btn saas-btn--ghost"
                  onClick={addButton}
                  disabled={form.buttons.length >= 3}
                >
                  + Add button
                </button>
              </div>
              {form.buttons.length === 0 ? (
                <div className="saas-empty-buttons">
                  <p>No buttons yet. Add one to drive a call-to-action.</p>
                </div>
              ) : (
                <div className="saas-button-list">
                  {form.buttons.map((btn, i) => (
                    <div key={i} className="saas-button-card">
                      <div className="saas-button-card-head">
                        <span className="saas-button-index">Button {i + 1}</span>
                        <button
                          type="button"
                          className="saas-btn saas-btn--text-danger"
                          onClick={() =>
                            setForm({ ...form, buttons: form.buttons.filter((_, j) => j !== i) })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="saas-button-card-grid">
                        <div className="saas-field">
                          <label>Type</label>
                          <select
                            className="saas-select"
                            value={btn.type}
                            onChange={(e) => {
                              const buttons = [...form.buttons];
                              buttons[i] = {
                                ...buttons[i],
                                type: e.target.value as TemplateButton["type"]
                              };
                              setForm({ ...form, buttons });
                            }}
                          >
                            <option value="quick_reply">Quick reply</option>
                            <option value="url">URL link</option>
                            <option value="phone">Phone</option>
                          </select>
                        </div>
                        <div className="saas-field">
                          <label>Label</label>
                          <input
                            className="saas-input"
                            placeholder="Button text"
                            maxLength={25}
                            value={btn.text}
                            onChange={(e) => {
                              const buttons = [...form.buttons];
                              buttons[i] = { ...buttons[i], text: e.target.value };
                              setForm({ ...form, buttons });
                            }}
                          />
                        </div>
                        <div className="saas-field saas-field--full">
                          <label>
                            {btn.type === "url"
                              ? "URL"
                              : btn.type === "phone"
                                ? "Phone number"
                                : "Payload"}
                          </label>
                          <input
                            className="saas-input"
                            placeholder={
                              btn.type === "url"
                                ? "https://example.com/menu"
                                : btn.type === "phone"
                                  ? "+919876543210"
                                  : "reply"
                            }
                            value={btn.value}
                            onChange={(e) => {
                              const buttons = [...form.buttons];
                              buttons[i] = { ...buttons[i], value: e.target.value };
                              setForm({ ...form, buttons });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="saas-template-preview-panel">
            <div className="saas-preview-sticky">
              <p className="dash-eyebrow">Live preview</p>
              <div className="saas-wa-phone">
                <div className="saas-wa-phone-bar">
                  <span className="saas-wa-phone-dot" />
                  <span>WhatsApp</span>
                </div>
                <div className="saas-wa-chat">
                  <div className="saas-wa-bubble">
                    {form.headerImageUrl && (
                      <img
                        src={form.headerImageUrl}
                        alt=""
                        className="saas-wa-bubble-img"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    {form.headerText && (
                      <p className="saas-wa-bubble-header">{form.headerText}</p>
                    )}
                    <p className="saas-wa-bubble-body">{renderBodyPreview(form.body)}</p>
                    {form.footerText && (
                      <p className="saas-wa-bubble-footer">{form.footerText}</p>
                    )}
                    <span className="saas-wa-bubble-time">12:34</span>
                  </div>
                  {form.buttons.length > 0 && (
                    <div className="saas-wa-actions">
                      {form.buttons.map((b, i) => (
                        <span key={i} className="saas-wa-action-btn">
                          {b.type === "url" && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M10 14H6a4 4 0 010-8h4M14 10h4a4 4 0 010 8h-4M8 12h8"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          )}
                          {b.type === "phone" && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          )}
                          {b.text || BUTTON_TYPE_LABELS[b.type]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="saas-preview-note">
                Variables like {"{{name}}"} are replaced at send time with customer data.
              </p>
            </div>
          </aside>
        </div>

        <footer className="saas-modal-footer">
          {error && <div className="saas-form-error">{error}</div>}
          <div className="saas-modal-footer-actions">
            <button type="button" className="dash-btn dash-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="dash-btn dash-btn--primary"
              onClick={save}
              disabled={loading || !form.name.trim() || !form.body.trim()}
            >
              {loading ? "Saving…" : template ? "Save changes" : "Create template"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
