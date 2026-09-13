"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardHero, DashboardToday, type DashboardKpis } from "./DashboardHero";
import { CustomerQuickEntryForm } from "./CustomerQuickEntryForm";
import { OverdueNow, type OverdueCustomer } from "./OverdueNow";
import { ConsentGap } from "./ConsentGap";

export interface RecentCustomer {
  id: string;
  name: string;
  mobile: string;
  pincode: string | null;
  totalSpend: number;
  createdAt: string;
}

export function DashboardClient({
  shopLogo,
  kpis,
  overdueCustomers,
  overdueTotal,
  recentCustomers
}: {
  shopLogo: string | null;
  kpis: DashboardKpis;
  overdueCustomers: OverdueCustomer[];
  overdueTotal: number;
  recentCustomers: RecentCustomer[];
}) {
  const [phoneDigits, setPhoneDigits] = useState("");

  return (
    <>

      {/* Order is the point of this page. What needs attention comes first,
          then the till figures, then the data entry that produces them —
          the previous arrangement opened with a form. */}
      <DashboardHero shopLogo={shopLogo} kpis={kpis} />

      {phoneDigits.length === 0 && (
        <OverdueNow customers={overdueCustomers} total={overdueTotal} />
      )}

      {phoneDigits.length === 0 && <ConsentGap consent={kpis.consent} />}

      <DashboardToday kpis={kpis} />
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
