import type { LookupCustomer } from "./ReturningCustomerCard";

export function CustomerPrefixTypeahead({
  items,
  onSelect
}: {
  items: LookupCustomer[];
  onSelect: (customer: LookupCustomer) => void;
}) {
  if (items.length === 0) {
    return <p className="merchant-muted merchant-typeahead-empty">No matching customers.</p>;
  }

  return (
    <ul className="merchant-typeahead">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" className="merchant-typeahead-item" onClick={() => onSelect(item)}>
            <strong>{item.name}</strong>
            <span>{item.mobile}</span>
            <span className="merchant-typeahead-meta">
              {item.totalVisits} visits · ₹{Number(item.totalSpend).toLocaleString("en-IN")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
