"use client";

import { useRef, useState } from "react";
import type { GlobalTemplate } from "./template-types";

/**
 * Registering a template with Meta — the last thing between this repo and a
 * working pilot.
 *
 * `approvalStatus` is Custva's own review flag and has never meant anything to
 * Meta. A template marked approved here is still refused at send time, one
 * failed message at a time, because Meta has never seen it. The two statuses
 * are shown side by side for exactly that reason: they are different facts and
 * conflating them is how a campaign fails silently.
 */

const META_LABEL: Record<string, { text: string; tone: string }> = {
  APPROVED: { text: "Approved by Meta", tone: "ok" },
  PENDING: { text: "Waiting on Meta review", tone: "wait" },
  IN_APPEAL: { text: "In appeal", tone: "wait" },
  REJECTED: { text: "Rejected by Meta", tone: "bad" },
  PAUSED: { text: "Paused by Meta", tone: "bad" },
  DISABLED: { text: "Disabled by Meta", tone: "bad" },
  MISSING_AT_META: { text: "Not found at Meta", tone: "bad" }
};

interface Problem {
  field: string;
  issue: string;
}

export function MetaTemplatePanel({
  template,
  onChanged
}: {
  template: GlobalTemplate;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [problems, setProblems] = useState<Problem[]>([]);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = template.metaStatus
    ? (META_LABEL[template.metaStatus] ?? { text: template.metaStatus, tone: "wait" })
    : null;

  const call = async (path: string, label: string) => {
    setBusy(label);
    setProblems([]);
    setNote("");
    try {
      const res = await fetch(`/api/admin/templates/${template.id}/${path}`, { method: "POST" });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        details?: Problem[];
        data?: { problems?: Problem[]; status?: string; ok?: boolean };
      };
      if (!res.ok || !json.success) {
        setProblems(json.details?.length ? json.details : [{ field: "", issue: json.message ?? "Failed." }]);
        return;
      }
      if (json.data?.problems?.length) {
        setProblems(json.data.problems);
        return;
      }
      setNote(json.data?.status ? `Meta says: ${json.data.status}` : "Done.");
      onChanged();
    } finally {
      setBusy("");
    }
  };

  const upload = async (file: File) => {
    setBusy("image");
    setProblems([]);
    setNote("");
    try {
      /* Sent as raw bytes with the real image content type. The API reads the
         bytes to identify the file rather than trusting this header — a client
         can label a PDF image/png and Meta will not be fooled. */
      const res = await fetch(`/api/admin/templates/${template.id}/header-image`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: await file.arrayBuffer()
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        details?: Problem[];
        data?: {
          width?: number;
          height?: number;
          reusedExistingUpload?: boolean;
          pendingUpload?: boolean;
          warnings?: string[];
          note?: string;
        };
      };
      if (!res.ok || !json.success) {
        setProblems(json.details?.length ? json.details : [{ field: "", issue: json.message ?? "Upload failed." }]);
        return;
      }
      const d = json.data ?? {};
      /* The API's own note, not a reworded one: it distinguishes "Meta has it"
         from "we have it and Meta does not", and that difference decides
         whether a send will work. */
      setNote(
        `${d.width}×${d.height}${d.reusedExistingUpload ? " (Meta already had this image)" : ""} — ${d.note ?? "saved."}`
      );
      if (d.warnings?.length) setProblems(d.warnings.map((w) => ({ field: "", issue: w })));
      onChanged();
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="meta-panel">
      <div className="meta-panel-head">
        <h3>Meta registration</h3>
        {meta ? (
          <span className={`meta-pill meta-pill--${meta.tone}`}>{meta.text}</span>
        ) : (
          <span className="meta-pill meta-pill--none">Never submitted</span>
        )}
      </div>

      <p className="meta-panel-note">
        {/* The distinction this panel exists to make. */}
        The approval flag elsewhere on this page is Custva&apos;s own review. It has no bearing on
        whether Meta will deliver the message — only the status above does.
      </p>

      <dl className="meta-facts">
        <div>
          <dt>Name at Meta</dt>
          <dd>{template.metaTemplateName ?? <span className="dash-empty">not assigned yet</span>}</dd>
        </div>
        <div>
          <dt>Header image</dt>
          <dd>
            {template.headerImageHandle ? (
              "Meta has it"
            ) : template.hasPendingImage ? (
              /* Stored but not handed over. "None" here would send someone
                 hunting for an upload that already worked. */
              <span className="meta-pending">Saved — Meta does not have it yet</span>
            ) : (
              <span className="dash-empty">none</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Last checked</dt>
          {/* Meta does not call back when a review finishes, so the status is a
              snapshot from whenever it was last asked. Saying when matters. */}
          <dd>
            {template.metaSyncedAt ? (
              new Date(template.metaSyncedAt).toLocaleString("en-IN")
            ) : (
              <span className="dash-empty">never</span>
            )}
          </dd>
        </div>
      </dl>

      {template.metaRejectedReason && (
        <p className="meta-reject">Meta&apos;s reason: {template.metaRejectedReason}</p>
      )}

      <div className="meta-actions">
        <button
          type="button"
          className="dash-btn"
          disabled={Boolean(busy)}
          onClick={() => void call("validate-for-meta", "validate")}
        >
          {busy === "validate" ? "Checking…" : "Check before submitting"}
        </button>
        <button
          type="button"
          className="dash-btn dash-btn--primary"
          disabled={Boolean(busy)}
          onClick={() => void call("submit-to-meta", "submit")}
        >
          {/* Keyed off whether it was actually submitted, not off the name.
              `meta_template_name` is backfilled for every template by migration
              0019, so keying on it labelled a never-submitted template
              "Resubmit". */}
          {busy === "submit"
            ? "Submitting…"
            : template.metaSubmittedAt
              ? "Resubmit to Meta"
              : "Submit to Meta"}
        </button>
        <button
          type="button"
          className="dash-btn"
          disabled={Boolean(busy) || !template.metaSubmittedAt}
          onClick={() => void call("sync-meta-status", "sync")}
        >
          {busy === "sync" ? "Asking Meta…" : "Check status now"}
        </button>
        <button
          type="button"
          className="dash-btn"
          disabled={Boolean(busy)}
          onClick={() => fileRef.current?.click()}
        >
          {busy === "image" ? "Uploading…" : "Upload header image"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </div>

      <p className="meta-hint">
        Header images are cropped to about 1.91:1 in the message bubble, so anything squarer loses
        its top and bottom. JPEG or PNG, under 5&nbsp;MB.
      </p>

      {problems.length > 0 && (
        <ul className="meta-problems">
          {problems.map((p, i) => (
            <li key={i}>
              {p.field ? <strong>{p.field}: </strong> : null}
              {p.issue}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="meta-ok">{note}</p>}
    </section>
  );
}
