export interface LookupCustomer {
  id: string;
  name: string;
  mobile: string;
  pincode: string | null;
  age: number | null;
  totalSpend: number;
  totalVisits: number;
  lastVisit: string | null;
  consentState?: "granted" | "withdrawn" | "unknown" | null;
}

export function ReturningCustomerCard({ customer }: { customer: LookupCustomer }) {
  return (
    <div className="merchant-returning-card">
      <p className="merchant-returning-label">Returning customer</p>
      <h3>{customer.name}</h3>
      <p className="merchant-muted">{customer.mobile}</p>
      <div className="merchant-returning-stats">
        <span>{customer.totalVisits} visits</span>
        <span>₹{Number(customer.totalSpend).toLocaleString("en-IN")} spent</span>
        {customer.lastVisit && (
          <span>Last visit {new Date(customer.lastVisit).toLocaleDateString("en-IN")}</span>
        )}
      </div>
    </div>
  );
}
