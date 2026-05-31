import Link from "next/link";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

const FEATURES = [
  {
    title: "Customer Intelligence",
    desc: "Capture walk-in profiles, visit frequency, average spend, and lifetime value — all from one unified dashboard.",
    num: "01",
  },
  {
    title: "WhatsApp Campaigns",
    desc: "Send personalized, segmented WhatsApp messages at scale. Schedule, queue, and track delivery in real time.",
    num: "02",
  },
  {
    title: "Retention Analytics",
    desc: "Measure repeat rate, inactive cohorts, and campaign ROI with clarity. Know exactly what's working.",
    num: "03",
  },
  {
    title: "Audience Segmentation",
    desc: "Filter by recency, spend, location, or visit count. Target the right customers at the right moment.",
    num: "04",
  },
  {
    title: "Workflow Automation",
    desc: "Automate follow-ups, re-engagement sequences, and milestone rewards without manual effort.",
    num: "05",
  },
  {
    title: "Secure & Compliant",
    desc: "Built on Indian infrastructure. DPDP-aligned data handling with role-based access controls.",
    num: "06",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Capture walk-in data",
    desc: "Log customer name, phone, spend, and visit details at checkout — takes under 10 seconds.",
  },
  {
    step: "02",
    title: "Segment your audience",
    desc: "Filter by spend bracket, inactivity window, location, or visit frequency in a few clicks.",
  },
  {
    step: "03",
    title: "Launch WhatsApp campaigns",
    desc: "Create personalised messages, schedule sends, and let Custva handle queue delivery.",
  },
  {
    step: "04",
    title: "Measure and optimise",
    desc: "Track repeat visits, campaign conversions, and retention trends from one clean dashboard.",
  },
];

const STATS = [
  { value: "3x", label: "More repeat visits" },
  { value: "60%", label: "Reduction in churn" },
  { value: "10s", label: "Avg. customer capture time" },
  { value: "Zero", label: "Extra per-message cost" },
];

const FAQS = [
  {
    q: "Who is Custva built for?",
    a: "Custva is built for offline businesses — cafes, restaurants, bakeries, salons, gyms, and local retail stores that want to grow through repeat customers.",
  },
  {
    q: "Do my customers need to download an app?",
    a: "No. Custva works entirely via WhatsApp. Your customers receive messages on their existing number — zero friction, zero downloads.",
  },
  {
    q: "How is customer data stored?",
    a: "All data is stored on Indian cloud infrastructure and handled in compliance with India's DPDP Act. You own your data.",
  },
  {
    q: "Can I use Custva for multiple outlets?",
    a: "Yes. Our platform supports multi-outlet management with a unified dashboard and branch-level analytics.",
  },
];

const CONTACT_METHODS = [
  {
    label: "Email Us",
    value: "support@custva.com",
    href: "mailto:support@custva.com",
    desc: "We respond within 24 hours on business days.",
    id: "contact-email",
  },
  {
    label: "Call Us",
    value: "+91 90000 00000",
    href: "tel:+919000000000",
    desc: "Mon – Sat, 10:00 AM to 7:00 PM IST",
    id: "contact-phone",
  },
];

export default function LandingPage() {
  return (
    <main className="landing-shell">
      {/* ── NAV ── */}
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="brand-logo-mark">C</span>
          Custva
        </div>
        <nav className="landing-nav-links">
          {NAV_LINKS.map((l) => (
            <a key={l.label} href={l.href} className="nav-link">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="landing-nav-actions">
          <Link href="/login" className="nav-btn-primary">
            Join with us
          </Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="landing-hero" id="hero">
        <div className="hero-eyebrow">
          <span className="eyebrow-dot" />
          Customer Retention OS for Offline India
        </div>
        <h1 className="hero-heading">
          Turn every walk-in into a{" "}
          <span className="hero-highlight">repeat customer</span>
        </h1>
        <p className="hero-subtext">
          Custva helps cafes, restaurants, bakeries, salons, and retail stores
          capture customer data, launch WhatsApp campaigns, and measure
          retention — all from one simple dashboard.
        </p>
        <div className="hero-cta-row">
          <Link href="/login" className="cta-primary" id="hero-signup-btn">
            Start your Journey on Custva
          </Link>
        </div>
        <div className="hero-trust-row">
          <span>Made in India</span>
          <span className="trust-sep">·</span>
          <span>DPDP Compliant</span>
          <span className="trust-sep">·</span>
          <span>WhatsApp Native</span>
          <span className="trust-sep">·</span>
          <span>No app needed</span>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="stats-strip" id="stats">
        {STATS.map((s) => (
          <div key={s.label} className="stat-item">
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </section>

      {/* ── FEATURES ── */}
      <section className="section-block" id="features">
        <div className="section-header">
          <span className="section-tag">Platform Features</span>
          <h2 className="section-heading">
            Everything your business needs to retain more customers
          </h2>
          <p className="section-subtext">
            One platform. Zero complexity. Built specifically for offline Indian
            merchants.
          </p>
        </div>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature-card">
              <div className="feature-num">{f.num}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="section-block" id="how-it-works">
        <div className="section-header">
          <span className="section-tag">How It Works</span>
          <h2 className="section-heading">Live in minutes. Results in weeks.</h2>
          <p className="section-subtext">
            No complex setup. No IT team required. Just four steps to a
            retention machine.
          </p>
        </div>
        <div className="workflow-grid">
          {HOW_IT_WORKS.map((step) => (
            <article key={step.step} className="workflow-step">
              <div className="workflow-step-num">{step.step}</div>
              <h3 className="workflow-step-title">{step.title}</h3>
              <p className="workflow-step-desc">{step.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="section-block" id="faq">
        <div className="section-header">
          <span className="section-tag">FAQ</span>
          <h2 className="section-heading">Common questions, answered.</h2>
        </div>
        <div className="faq-grid">
          {FAQS.map((item) => (
            <article key={item.q} className="faq-item">
              <h3 className="faq-question">{item.q}</h3>
              <p className="faq-answer">{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── CONNECT WITH US ── */}
      <section className="section-block contact-section" id="contact">
        <div className="section-header">
          <span className="section-tag">Connect With Us</span>
          <h2 className="section-heading">We are here to help</h2>
          <p className="section-subtext">
            Have a question or want to know if Custva is right for your
            business? Reach out — our team responds quickly.
          </p>
        </div>
        <div className="contact-grid">
          {CONTACT_METHODS.map((c) => (
            <a
              key={c.id}
              href={c.href}
              id={c.id}
              className="contact-card"
            >
              <div className="contact-card-label">{c.label}</div>
              <div className="contact-card-value">{c.value}</div>
              <p className="contact-card-desc">{c.desc}</p>
              <span className="contact-card-arrow">Get in touch</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="final-cta-section">
        <div className="final-cta-inner">
          <span className="section-tag">Get Started Today</span>
          <h2 className="final-cta-heading">
            Ready to make retention a system?
          </h2>
          <p className="final-cta-sub">
            Join Indian merchants using Custva to grow through repeat customers.
            Free trial, no credit card needed.
          </p>
          <div className="hero-cta-row">
            <Link href="/login" className="cta-primary" id="final-cta-signup-btn">
              Join with us
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        <div className="footer-top">
          <div className="footer-brand-col">
            <div className="landing-brand">
              <span className="brand-logo-mark">C</span>
              Custva
            </div>
            <p className="footer-tagline">
              Retention intelligence for offline businesses across India.
            </p>
            <div className="footer-india-badge">Proudly built in India</div>
          </div>
          <div className="footer-links-col">
            <div className="footer-link-group">
              <div className="footer-link-heading">Product</div>
              <a href="#features" className="footer-link">Features</a>
              <a href="#how-it-works" className="footer-link">How It Works</a>
              <a href="#faq" className="footer-link">FAQ</a>
            </div>
            <div className="footer-link-group">
              <div className="footer-link-heading">Company</div>
              <a href="#" className="footer-link">About</a>
              <a href="#" className="footer-link">Blog</a>
              <a href="#" className="footer-link">Careers</a>
            </div>
            <div className="footer-link-group">
              <div className="footer-link-heading">Contact</div>
              <a href="mailto:support@custva.com" className="footer-link">
                support@custva.com
              </a>
              <a href="tel:+919000000000" className="footer-link">
                +91 90000 00000
              </a>
              <span className="footer-link">Mon–Sat, 10 AM – 7 PM</span>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2025 Custva. All rights reserved.</span>
          <span className="footer-legal-links">
            <a href="#" className="footer-legal-link">Privacy Policy</a>
            <a href="#" className="footer-legal-link">Terms of Service</a>
          </span>
        </div>
      </footer>
    </main>
  );
}
