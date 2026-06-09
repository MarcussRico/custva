"use client";

import Link from "next/link";
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
}

const EMPTY_FILTERS = {
  q: "",
  minSpend: "",
  exactVisits: "",
  tag: "",
  inactiveDaysExact: ""
};

export function CustomersPageClient() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState(EMPTY_FILTERS);

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
    return count;
  }, [debouncedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", sortBy: "updatedAt" });
      if (debouncedFilters.q.trim()) params.set("q", debouncedFilters.q.trim());
      if (debouncedFilters.minSpend.trim()) params.set("minSpend", debouncedFilters.minSpend.trim());
      if (debouncedFilters.exactVisits.trim()) params.set("exactVisits", debouncedFilters.exactVisits.trim());
      if (debouncedFilters.tag) params.set("tag", debouncedFilters.tag);
      if (debouncedFilters.inactiveDaysExact.trim()) {
        params.set("inactiveDaysExact", debouncedFilters.inactiveDaysExact.trim());
      }
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
                <th>Pincode</th>
                <th>Visits</th>
                <th>Spend</th>
                <th>Tags</th>
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
                    <td>{c.pincode ?? "—"}</td>
                    <td>{c.totalVisits}</td>
                    <td>₹{Number(c.totalSpend).toLocaleString("en-IN")}</td>
                    <td>{(c.autoTags ?? []).join(", ") || "—"}</td>
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
