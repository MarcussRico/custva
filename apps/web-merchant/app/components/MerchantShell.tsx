import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

type NavKey = "dashboard" | "customers" | "templates" | "campaigns" | "analytics" | "profile";

const NAV: Array<{ key: NavKey; href: string; label: string }> = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard" },
  { key: "customers", href: "/customers", label: "Customers" },
  { key: "templates", href: "/templates", label: "Templates" },
  { key: "campaigns", href: "/campaigns", label: "Campaigns" },
  { key: "analytics", href: "/analytics", label: "Analytics" }
];

export function MerchantShell({
  active,
  shopName,
  children
}: {
  active: NavKey;
  shopName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="merchant-app-layout">
      <header className="merchant-topbar">
        <div className="merchant-topbar-brand">
          <span className="merchant-topbar-mark">C</span>
          <div>
            <strong className="merchant-topbar-title">{shopName ?? "Custva Merchant"}</strong>
            <span className="merchant-topbar-sub">Customer Retention OS</span>
          </div>
        </div>
        <LogoutButton />
      </header>
      <aside className="merchant-sidebar">
        <nav className="merchant-sidebar-nav">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`merchant-sidebar-link ${active === item.key ? "merchant-sidebar-link--active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="merchant-sidebar-footer">
          <Link
            href="/profile"
            className={`merchant-sidebar-link merchant-sidebar-link--footer ${active === "profile" ? "merchant-sidebar-link--active" : ""}`}
          >
            Profile
          </Link>
        </div>
      </aside>
      <main className="merchant-main">{children}</main>
    </div>
  );
}
