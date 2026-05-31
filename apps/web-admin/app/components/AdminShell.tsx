import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

type NavKey = "dashboard" | "merchants" | "templates";

const NAV: Array<{ key: NavKey; href: string; label: string }> = [
  { key: "dashboard", href: "/dashboard", label: "Analytics" },
  { key: "merchants", href: "/merchants", label: "Merchants" },
  { key: "templates", href: "/templates", label: "Templates" }
];

export function AdminShell({
  active,
  children
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="dash-layout">
      <header className="dash-topbar">
        <div className="dash-topbar-brand">
          <div className="dash-sidebar-mark">C</div>
          <span className="dash-topbar-title">Custva Admin</span>
        </div>
        <LogoutButton />
      </header>

      <aside className="dash-sidebar">
        <nav className="dash-nav">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`dash-nav-link ${active === item.key ? "dash-nav-link--active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="dash-main">{children}</div>
    </div>
  );
}
