import { AdminShell } from "../components/AdminShell";

export default function TemplatesPage() {
  return (
    <AdminShell active="templates">
      <header className="dash-header">
        <div>
          <p className="dash-eyebrow">Platform</p>
          <h1 className="dash-heading">Global Templates</h1>
        </div>
      </header>
      <p className="dash-empty">No global templates yet.</p>
    </AdminShell>
  );
}
