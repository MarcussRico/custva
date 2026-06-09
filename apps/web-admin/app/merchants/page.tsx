import { AdminShell } from "../components/AdminShell";
import { MerchantsPageClient } from "../components/MerchantsPageClient";

export default function MerchantsPage() {
  return (
    <AdminShell active="merchants">
      <MerchantsPageClient />
    </AdminShell>
  );
}
