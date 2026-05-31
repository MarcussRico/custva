import Link from "next/link";

export default function AdminHeroPage() {
  return (
    <main className="admin-hero-shell">
      {/* Animated background grid */}
      <div className="admin-hero-grid" aria-hidden="true" />

      {/* Glow orbs */}
      <div className="admin-orb admin-orb--gold" aria-hidden="true" />
      <div className="admin-orb admin-orb--blue" aria-hidden="true" />

      {/* Scanline overlay */}
      <div className="admin-scanlines" aria-hidden="true" />

      <div className="admin-hero-content">
        {/* Badge */}
        <div className="admin-hero-badge">
          <span className="admin-hero-badge-dot" />
          Platform Administration System
        </div>

        {/* Logo mark */}
        <div className="admin-hero-logo">
          <div className="admin-hero-logo-mark">C</div>
          <span className="admin-hero-logo-name">Custva</span>
        </div>

        {/* Heading */}
        <h1 className="admin-hero-heading">
          Admin <span className="admin-hero-heading-accent">Control</span> Panel
        </h1>

        {/* Sub */}
        <p className="admin-hero-sub">
          Restricted access. Authorised personnel only.
          <br />
          Platform-level merchant oversight, analytics, and governance.
        </p>

        {/* Divider */}
        <div className="admin-hero-divider" aria-hidden="true">
          <span />
          <span className="admin-hero-divider-text">secure area</span>
          <span />
        </div>

        {/* CTA */}
        <Link href="/login" className="admin-hero-cta" id="admin-login-btn">
          <span className="admin-hero-cta-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
          Login into Custva Admin Panel
          <span className="admin-hero-cta-arrow" aria-hidden="true">→</span>
        </Link>

        {/* Security notice */}
        <p className="admin-hero-notice">
          All access attempts are logged and monitored.
          Unauthorised access is prohibited.
        </p>
      </div>

      {/* Version / footer watermark */}
      <footer className="admin-hero-footer">
        <span>Custva Platform v1.0</span>
        <span className="admin-hero-footer-sep">·</span>
        <span>Internal Use Only</span>
        <span className="admin-hero-footer-sep">·</span>
        <span>© 2025 Custva</span>
      </footer>
    </main>
  );
}
