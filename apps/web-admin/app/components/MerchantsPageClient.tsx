"use client";

import { useState } from "react";
import { AddMerchantModal } from "./AddMerchantModal";

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

export function MerchantsPageClient({ merchants }: { merchants: MerchantRow[] }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <header className="dash-header">
        <div>
          <p className="dash-eyebrow">Platform</p>
          <h1 className="dash-heading">Merchants</h1>
          <p className="dash-subheading">
            View and manage all onboarded shops on the platform.
          </p>
        </div>
        <div className="dash-header-actions">
          <button
            type="button"
            className="dash-btn dash-btn--primary"
            onClick={() => setModalOpen(true)}
          >
            + Add Merchant
          </button>
        </div>
      </header>

      {merchants.length === 0 ? (
        <div className="dash-empty-state">
          <p>No merchants onboarded yet.</p>
          <button
            type="button"
            className="dash-btn dash-btn--primary"
            onClick={() => setModalOpen(true)}
          >
            Add your first merchant
          </button>
        </div>
      ) : (
        <div className="dash-table-wrap dash-panel">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Owner</th>
                <th>Address</th>
                <th>Pincode</th>
                <th>Categories</th>
                <th>Revenue</th>
                <th>Customers</th>
                <th>Status</th>
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
                  <td>{m.shopAddress}</td>
                  <td>{m.pincode}</td>
                  <td>{(m.itemCategories ?? []).join(", ")}</td>
                  <td>{formatInr(Number(m.currentRevenue ?? 0))}</td>
                  <td>{m.totalCustomers ?? 0}</td>
                  <td>
                    <span className={`dash-status dash-status--${m.status}`}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddMerchantModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
