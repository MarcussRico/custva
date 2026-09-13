"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface CustomerRow {
  id: string;
  name: string;
  mobile: string;
  pincode: string | null;
  age: number | null;
  totalSpend: number;
  totalVisits: number;
  lastVisit: string | null;
  autoTags: string[];
  /* The behavioural segment, from each customer's own visit rhythm. Distinct
     from `autoTags`, which are global thresholds (spend > 2000, inactive > 30
     days) and say nothing about whether a person is actually overdue. */
  segment: "first_time" | "loyal" | "at_risk" | "dormant" | null;
  expectedGapDays: string | number | null;
  expectedRevisitAt: string | null;
}

const SEGMENT_LABEL: Record<string, string> = {
  first_time: "First visit",
  loyal: "On schedule",
  at_risk: "Overdue",
  dormant: "Long gone"
};

/** Plain language, because "1.7x expected gap" means nothing at a counter. */
function dueLabel(row: CustomerRow): string {
  if (!row.expectedRevisitAt) return "—";
  const due = new Date(row.expectedRevisitAt).getTime();
  const days = Math.round((Date.now() - due) / 86_400_000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `Due in ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
}

const SEGMENTS = ["first_time", "loyal", "at_risk", "dormant"];

const EMPTY_FILTERS = {
  q: "",
  minSpend: "",
  exactVisits: "",
  tag: "",
  inactiveDaysExact: "",
  segment: "",
  overdueOnly: false
};

export function CustomersPageClient() {
  /* The dashboard links straight here with a filter already applied — "see all
     7 overdue" has to arrive showing those 7, not the whole book. */
  const search = useSearchParams();
  const initialFilters = useMemo(
    () => ({
      ...EMPTY_FILTERS,
      segment: SEGMENTS.includes(search.get("segment") ?? "") ? search.get("segment")! : "",
      overdueOnly: search.get("overdueOnly") === "1" || search.get("overdueOnly") === "true"
    }),
    [search]
  );

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [debouncedFilters, setDebouncedFilters] = useState(initialFilters);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 350);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    setPage(1);
  }, [debouncedFilters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (debouncedFilters.q.trim()) count++;
    if (debouncedFilters.minSpend.trim()) count++;
    if (debouncedFilters.exactVisits.trim()) count++;
    if (debouncedFilters.tag) count++;
    if (debouncedFilters.inactiveDaysExact.trim()) count++;
    if (debouncedFilters.segment) count++;
    if (debouncedFilters.overdueOnly) count++;
    return count;
  }, [debouncedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        /* Filtering to overdue and then sorting by last edit buries the person
           who has been missing longest. */
        sortBy: debouncedFilters.overdueOnly ? "overdue" : "updatedAt"
      });
      if (debouncedFilters.q.trim()) params.set("q", debouncedFilters.q.trim());
      if (debouncedFilters.minSpend.trim()) params.set("minSpend", debouncedFilters.minSpend.trim());
      if (debouncedFilters.exactVisits.trim()) params.set("exactVisits", debouncedFilters.exactVisits.trim());
      if (debouncedFilters.tag) params.set("tag", debouncedFilters.tag);
      if (debouncedFilters.inactiveDaysExact.trim()) {
        params.set("inactiveDaysExact", debouncedFilters.inactiveDaysExact.trim());
      }
      if (debouncedFilters.segment) params.set("segments", debouncedFilters.segment);
      if (debouncedFilters.overdueOnly) params.set("overdueOnly", "true");
      const res = await fetch(`/api/customers?${params}`);
      const json = (await res.json()) as {
        success: boolean;
        data?: { items: CustomerRow[] };
        meta?: { total: number };
      };
      if (json.success && json.data) {
        setCustomers(json.data.items);
        setTotal(json.meta?.total ?? json.data.items.length);
      }
    } finally {
      setLoading(false);
    }
  }, [page, debouncedFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setDebouncedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <>
      <header className="merchant-page-header">
        {activeFilterCount > 0 && (
          <div className="merchant-filter-summary">
            <span className="merchant-filter-badge">{activeFilterCount} active</span>
            <button type="button" className="merchant-link" onClick={clearFilters}>
              Clear all
            </button>
          </div>
        )}
      </header>

      <div className="merchant-filter-toolbar">
        <div className="merchant-filter-field merchant-filter-field--wide">
          <span className="merchant-filter-label">Search</span>
          <input
            placeholder="Name or mobile"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <div className="merchant-filter-field">
          <span className="merchant-filter-label">Min spend (≥)</span>
          <input
            type="number"
            min={0}
            placeholder="₹"
            value={filters.minSpend}
            onChange={(e) => setFilters({ ...filters, minSpend: e.target.value })}
          />
        </div>
        <div className="merchant-filter-field">
          <span className="merchant-filter-label">Visits</span>
          <input
            type="number"
            min={0}
            placeholder="Exact count"
            value={filters.exactVisits}
            onChange={(e) => setFilters({ ...filters, exactVisits: e.target.value })}
          />
        </div>
        <div className="merchant-filter-field">
          <span className="merchant-filter-label">Tags</span>
          <select value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}>
            <option value="">All tags</option>
            <option value="New">New</option>
            <option value="Repeat">Repeat</option>
            <option value="High-value">High-value</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div className="merchant-filter-field">
          <span className="merchant-filter-label">Status</span>
          <select
            value={filters.segment}
            onChange={(e) => setFilters({ ...filters, segment: e.target.value })}
          >
            <option value="">Any status</option>
            <option value="first_time">First visit</option>
            <option value="loyal">On schedule</option>
            <option value="at_risk">Overdue</option>
            <option value="dormant">Long gone</option>
          </select>
        </div>
        <div className="merchant-filter-field">
          <span className="merchant-filter-label">Overdue</span>
          <label className="merchant-filter-check">
            <input
              type="checkbox"
              checked={filters.overdueOnly}
              onChange={(e) => setFilters({ ...filters, overdueOnly: e.target.checked })}
            />
            <span>Past their usual visit</span>
          </label>
        </div>
        <div className="merchant-filter-field">
          <span className="merchant-filter-label">Inactive days</span>
          <input
            type="number"
            min={0}
            placeholder="Exact days"
            value={filters.inactiveDaysExact}
            onChange={(e) => setFilters({ ...filters, inactiveDaysExact: e.target.value })}
          />
        </div>
      </div>

      {loading ? (
        <p className="merchant-muted">Loading...</p>
      ) : (
        <div className="merchant-panel">
          <table className="merchant-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Status</th>
                <th>Next visit due</th>
                <th>Visits</th>
                <th>Spend</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="merchant-muted">
                    No customers match your filters.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.mobile}</td>
                    <td>
                      {c.segment ? (
                        <span className={`seg-pill seg-${c.segment}`}>
                          {SEGMENT_LABEL[c.segment]}
                        </span>
                      ) : (
                        <span className="merchant-muted">—</span>
                      )}
                    </td>
                    <td className={c.segment === "at_risk" || c.segment === "dormant" ? "seg-due" : ""}>
                      {dueLabel(c)}
                      {c.expectedGapDays ? (
                        <small className="seg-gap">
                          usually every {Math.round(Number(c.expectedGapDays))}d
                        </small>
                      ) : null}
                    </td>
                    <td>{c.totalVisits}</td>
                    <td>₹{Number(c.totalSpend).toLocaleString("en-IN")}</td>
                    <td>
                      <Link href={`/customers/${c.id}`} className="merchant-link">
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="merchant-pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} ({total} total)
            </span>
            <button type="button" disabled={customers.length < 20} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
