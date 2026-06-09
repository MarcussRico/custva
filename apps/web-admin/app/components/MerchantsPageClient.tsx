"use client";

import { useCallback, useEffect, useState } from "react";
import { AddMerchantModal } from "./AddMerchantModal";
import { EditMerchantModal } from "./EditMerchantModal";

export interface MerchantRow {
  id: string;
  shopName: string;
  ownerName: string;
  email: string;
  status: string;
  shopLogo: string | null;
  shopAddress: string;
  pincode: string;
  currentRevenue: number;
  itemCategories: string[];
  subscriptionStatus: string;
  totalCustomers?: number;
}

function formatInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

export function MerchantsPageClient() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [pincode, setPincode] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editMerchant, setEditMerchant] = useState<MerchantRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (pincode.trim()) params.set("pincode", pincode.trim());
      const res = await fetch(`/api/admin/merchants?${params}`);
      const json = (await res.json()) as {
        success: boolean;
        data?: { items: MerchantRow[]; total: number };
      };
      if (json.success && json.data) {
        setMerchants(json.data.items);
        setTotal(json.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, q, status, pincode]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <>
      <header className="dash-header">
        <div>
          <p className="dash-eyebrow">Platform</p>
          <h1 className="dash-heading">Merchants</h1>
          <p className="dash-subheading">Manage cafe merchants on the platform.</p>
        </div>
        <div className="dash-header-actions">
          <button type="button" className="dash-btn dash-btn--primary" onClick={() => setAddOpen(true)}>
            + Add Merchant
          </button>
        </div>
      </header>

      <div className="dash-filters dash-panel">
        <input
          className="dash-filter-input"
          placeholder="Search shop, owner, email..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="dash-filter-input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspended</option>
        </select>
        <input
          className="dash-filter-input"
          placeholder="Pincode"
          value={pincode}
          onChange={(e) => {
            setPincode(e.target.value.replace(/\D/g, "").slice(0, 6));
            setPage(1);
          }}
        />
        <button type="button" className="dash-btn dash-btn--secondary" onClick={() => void load()}>
          Apply
        </button>
      </div>

      {loading ? (
        <p className="dash-empty">Loading merchants...</p>
      ) : merchants.length === 0 ? (
        <div className="dash-empty-state">
          <p>No merchants found.</p>
          <button type="button" className="dash-btn dash-btn--primary" onClick={() => setAddOpen(true)}>
            Add Merchant
          </button>
        </div>
      ) : (
        <>
          <div className="dash-table-wrap dash-panel">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Owner</th>
                  <th>Pincode</th>
                  <th>Revenue</th>
                  <th>Customers</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {merchants.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="merchant-cell">
                        {m.shopLogo ? (
                          <img src={m.shopLogo} alt="" className="merchant-cell-logo" />
                        ) : (
                          <span className="merchant-cell-logo merchant-cell-logo--empty">
                            {m.shopName.charAt(0)}
                          </span>
                        )}
                        <div>
                          <strong>{m.shopName}</strong>
                          <br />
                          <span className="dash-table-muted">{m.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>{m.ownerName}</td>
                    <td>{m.pincode}</td>
                    <td>{formatInr(Number(m.currentRevenue ?? 0))}</td>
                    <td>{m.totalCustomers ?? 0}</td>
                    <td>
                      <span className={`dash-status dash-status--${m.status}`}>{m.status}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dash-link-btn"
                        onClick={() => setEditMerchant(m)}
                      >
                        Edit
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
              Page {page} of {totalPages} ({total} merchants)
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

      <AddMerchantModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => void load()}
      />
      <EditMerchantModal
        merchant={editMerchant}
        open={Boolean(editMerchant)}
        onClose={() => setEditMerchant(null)}
        onSaved={() => void load()}
      />
    </>
  );
}
