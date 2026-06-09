import { AdminShell } from "../components/AdminShell";
import { TemplatesPageClient } from "../components/TemplatesPageClient";

export default function TemplatesPage() {
  return (
    <AdminShell active="templates">
      <TemplatesPageClient />
    </AdminShell>
  );
}
