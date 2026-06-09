"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardHero, type DashboardKpis } from "./DashboardHero";
import { CustomerQuickEntryForm } from "./CustomerQuickEntryForm";

export interface RecentCustomer {
  id: string;
  name: string;
  mobile: string;
  pincode: string | null;
  totalSpend: number;
  createdAt: string;
}

export function DashboardClient({
  shopName,
  shopLogo,
  kpis,
  recentCustomers
}: {
  shopName: string;
  shopLogo: string | null;
  kpis: DashboardKpis;
  recentCustomers: RecentCustomer[];
}) {
  const [phoneDigits, setPhoneDigits] = useState("");

  return (
    <>

      <DashboardHero shopName={shopName} shopLogo={shopLogo} kpis={kpis} />
      <CustomerQuickEntryForm onPhoneDigitsChange={setPhoneDigits} />

      {phoneDigits.length === 0 && (
      <section className="merchant-panel merchant-recent-section">
        <h2>Recently added customers</h2>
        {recentCustomers.length === 0 ? (
          <p className="merchant-muted">No customers yet. Add your first customer above.</p>
        ) : (
          <table className="merchant-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Pincode</th>
                <th>Spend</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {recentCustomers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/customers/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>{c.mobile}</td>
                  <td>{c.pincode ?? "—"}</td>
                  <td>₹{Number(c.totalSpend).toLocaleString("en-IN")}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      )}
    </>
  );
}
