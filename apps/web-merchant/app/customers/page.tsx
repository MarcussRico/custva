import { merchantApi } from "../lib/api";
import { revalidatePath } from "next/cache";

interface CustomersData {
  items: Array<{
    id: string;
    name: string;
    mobile: string;
    totalVisits: number;
    totalSpend: number;
  }>;
}

export default async function CustomersPage() {
  let customers: CustomersData["items"] = [];
  try {
    const data = await merchantApi<CustomersData>("/customers");
    customers = data.items;
  } catch {
    customers = [];
  }
  async function addCustomer(formData: FormData) {
    "use server";
    const payload = {
      name: String(formData.get("name") ?? ""),
      mobile: String(formData.get("mobile") ?? ""),
      billingAmount: Number(formData.get("billingAmount") ?? 0),
      location: String(formData.get("location") ?? ""),
      visitDate: new Date().toISOString(),
      notes: String(formData.get("notes") ?? "")
    };
    const API_BASE = process.env.CUSTVA_API_BASE_URL ?? "http://localhost:4000/api/v1";
    await fetch(`${API_BASE}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dev-merchant-id":
          process.env.CUSTVA_DEV_MERCHANT_ID ?? "00000000-0000-0000-0000-000000000010"
      },
      body: JSON.stringify(payload)
    });
    revalidatePath("/customers");
  }

  return (
    <main className="merchant-shell">
      <header className="merchant-header">
        <h1>Customers</h1>
        <span className="badge">Live Table</span>
      </header>
      <section className="kpi-card">
        <h3>Add Customer Visit</h3>
        <form action={addCustomer}>
          <input name="name" placeholder="Name" required />{" "}
          <input name="mobile" placeholder="Mobile" required />{" "}
          <input name="billingAmount" type="number" placeholder="Bill Amount" required />{" "}
          <input name="location" placeholder="Location" required />{" "}
          <input name="notes" placeholder="Notes" />
          <button type="submit">Add</button>
        </form>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="left">Mobile</th>
              <th align="left">Visits</th>
              <th align="left">Total Spend</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.mobile}</td>
                <td>{c.totalVisits}</td>
                <td>₹{c.totalSpend}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
