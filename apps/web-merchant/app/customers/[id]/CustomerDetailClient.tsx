"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Visit {
  billingAmount: number;
  visitAt: string;
  ageAtVisit: number | null;
  notes: string | null;
}

interface CustomerDetail {
  id: string;
  name: string;
  mobile: string;
  pincode: string | null;
  age: number | null;
  totalSpend: number;
  totalVisits: number;
  lastVisit: string | null;
  autoTags: string[];
  visits: Visit[];
}

export function CustomerDetailClient({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [allVisits, setAllVisits] = useState<Visit[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/customers/${customerId}`);
      const json = (await res.json()) as { success: boolean; data?: CustomerDetail };
      if (json.success && json.data) setCustomer(json.data);

      const visitsRes = await fetch(`/api/customers/${customerId}/visits?limit=100`);
      const visitsJson = (await visitsRes.json()) as { success: boolean; data?: { items: Visit[] } };
      if (visitsJson.success && visitsJson.data) setAllVisits(visitsJson.data.items);
    })();
  }, [customerId]);

  if (!customer) return <p className="merchant-muted">Loading customer...</p>;

  const visits = allVisits.length ? allVisits : customer.visits;

  return (
    <>
      <header className="merchant-page-header">
        <div>
          <p className="merchant-eyebrow"><Link href="/customers">Customers</Link></p>
          <h1>{customer.name}</h1>
        </div>
      </header>
      <section className="merchant-panel">
        <p><strong>Mobile:</strong> {customer.mobile}</p>
        <p><strong>Pincode:</strong> {customer.pincode ?? "—"}</p>
        <p><strong>Age:</strong> {customer.age ?? "—"}</p>
        <p><strong>Total spend:</strong> ₹{Number(customer.totalSpend).toLocaleString("en-IN")}</p>
        <p><strong>Visits:</strong> {customer.totalVisits}</p>
        <p><strong>Tags:</strong> {(customer.autoTags ?? []).join(", ") || "—"}</p>
      </section>
      <section className="merchant-panel">
        <h2>Purchase history at shop</h2>
        <table className="merchant-table">
          <thead><tr><th>Date</th><th>Amount</th><th>Age at visit</th><th>Notes</th></tr></thead>
          <tbody>
            {visits.map((v, i) => (
              <tr key={i}>
                <td>{new Date(v.visitAt).toLocaleString("en-IN")}</td>
                <td>₹{Number(v.billingAmount).toLocaleString("en-IN")}</td>
                <td>{v.ageAtVisit ?? "—"}</td>
                <td>{v.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
