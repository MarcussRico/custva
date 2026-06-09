"use client";

import { useCallback, useEffect, useState } from "react";
import { AssignTemplateModal } from "./AssignTemplateModal";
import { PushUpdatesModal } from "./PushUpdatesModal";
import { TemplateFormModal } from "./TemplateFormModal";
import type { GlobalTemplate, TemplateAssignment } from "./template-types";

export function TemplatesPageClient() {
  const [templates, setTemplates] = useState<GlobalTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<GlobalTemplate | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [pushId, setPushId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<TemplateAssignment[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      const res = await fetch(`/api/admin/templates?${params}`);
      const json = (await res.json()) as {
        success: boolean;
        data?: { items: GlobalTemplate[]; total: number };
      };
      if (json.success && json.data) {
        setTemplates(json.data.items);
        setTotal(json.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  const loadAssignments = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/templates/${id}/assignments`);
    const json = (await res.json()) as {
      success: boolean;
      data?: { items: TemplateAssignment[] };
    };
    if (json.success && json.data) setAssignments(json.data.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (detailId) void loadAssignments(detailId);
  }, [detailId, loadAssignments]);

  const archive = async (id: string) => {
    if (!confirm("Archive this global template? Existing merchant copies remain.")) return;
    await fetch(`/api/admin/templates/${id}/archive`, { method: "POST" });
    if (detailId === id) setDetailId(null);
    void load();
  };

  const detail = templates.find((t) => t.id === detailId) ?? null;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <>
      <header className="dash-header">
        <div>
          <p className="dash-eyebrow">Platform</p>
          <h1 className="dash-heading">Global Templates</h1>
          <p className="dash-subheading">Cafe WhatsApp templates — fork to merchants on assign.</p>
        </div>
        <div className="dash-header-actions">
          <button
            type="button"
            className="dash-btn dash-btn--primary"
            onClick={() => {
              setEditTemplate(null);
              setFormOpen(true);
            }}
          >
            + Create Template
          </button>
        </div>
      </header>

      {loading ? (
        <p className="dash-empty">Loading templates...</p>
      ) : templates.length === 0 ? (
        <div className="dash-empty-state">
          <p>No global templates yet.</p>
          <button type="button" className="dash-btn dash-btn--primary" onClick={() => setFormOpen(true)}>
            Create Template
          </button>
        </div>
      ) : (
        <>
          <div className="dash-panel dash-panel-toolbar">
            <p className="dash-panel-toolbar-meta">
              {total} global template{total === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              className="dash-btn dash-btn--primary"
              onClick={() => {
                setEditTemplate(null);
                setFormOpen(true);
              }}
            >
              + Create Template
            </button>
          </div>
          <div className="dash-table-wrap dash-panel">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Assigned</th>
                  <th>Starter</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                      <br />
                      <span className="dash-table-muted">{t.body.slice(0, 60)}…</span>
                    </td>
                    <td>v{t.version}</td>
                    <td>{t.assignedCount ?? 0}</td>
                    <td>{t.isStarterPack ? "Yes" : "—"}</td>
                    <td className="template-actions-cell">
                      <button type="button" className="dash-link-btn" onClick={() => setDetailId(t.id)}>
                        View
                      </button>
                      <button
                        type="button"
                        className="dash-link-btn"
                        onClick={() => {
                          setEditTemplate(t);
                          setFormOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="dash-link-btn" onClick={() => setAssignId(t.id)}>
                        Assign
                      </button>
                      <button type="button" className="dash-link-btn dash-link-btn--danger" onClick={() => archive(t.id)}>
                        Archive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dash-pagination">
            <button
              type="button"
              className="dash-btn dash-btn--secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages} ({total} templates)
            </span>
            <button
              type="button"
              className="dash-btn dash-btn--secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}

      {detail && (
        <section className="dash-panel template-detail">
          <div className="dash-panel-head">
            <h2>{detail.name}</h2>
            <div className="template-detail-actions">
              <button type="button" className="dash-btn dash-btn--secondary" onClick={() => setAssignId(detail.id)}>
                Assign
              </button>
              <button type="button" className="dash-btn dash-btn--secondary" onClick={() => setPushId(detail.id)}>
                Push Updates
              </button>
              <button type="button" className="dash-link-btn" onClick={() => setDetailId(null)}>
                Close
              </button>
            </div>
          </div>
          <p>
            Version {detail.version} · {detail.assignedCount ?? 0} merchant copies
          </p>
          <div className="template-preview-card template-preview-card--inline">
            {detail.headerText && <strong>{detail.headerText}</strong>}
            <p>{detail.body}</p>
            {detail.footerText && <small>{detail.footerText}</small>}
          </div>
          <h3 className="template-detail-subhead">Assignments & version drift</h3>
          {assignments.length === 0 ? (
            <p className="dash-empty">Not assigned to any merchants yet.</p>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Copy version</th>
                  <th>Global version</th>
                  <th>Drift</th>
                  <th>Locally modified</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.copyId}>
                    <td>{a.shopName}</td>
                    <td>v{a.sourceVersion}</td>
                    <td>v{a.globalVersion}</td>
                    <td>{a.hasVersionDrift ? "Yes" : "No"}</td>
                    <td>{a.isLocallyModified ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <TemplateFormModal
        open={formOpen}
        template={editTemplate}
        onClose={() => {
          setFormOpen(false);
          setEditTemplate(null);
        }}
        onSaved={() => void load()}
      />
      <AssignTemplateModal
        templateId={assignId}
        open={Boolean(assignId)}
        onClose={() => setAssignId(null)}
        onAssigned={() => {
          void load();
          if (detailId) void loadAssignments(detailId);
        }}
      />
      <PushUpdatesModal
        templateId={pushId}
        open={Boolean(pushId)}
        onClose={() => setPushId(null)}
        onPushed={() => {
          if (detailId) void loadAssignments(detailId);
        }}
      />
    </>
  );
}
