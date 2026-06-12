"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

/* ─── DATA ──────────────────────────────────────────── */
const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Why Now", href: "#why-now" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

const BUSINESSES = [
  "☕ Cafes",
  "🍽️ Restaurants",
  "🥐 Bakeries",
  "✂️ Salons",
  "🛍️ Retail Stores",
  "💪 Gyms",
];

const STATS = [
  { value: "3x", label: "More repeat visits" },
  { value: "60%", label: "Reduction in churn" },
  { value: "10s", label: "Avg. customer capture time" },
  { value: "Zero", label: "Extra per-message cost" },
];

const WHY_NOW = [
  {
    icon: "📱",
    title: "WhatsApp is where your customers already are",
    desc: "500M+ Indians use WhatsApp daily. Reach them instantly — no new app, no friction, no downloads.",
    accent: "#ffd400",
  },
  {
    icon: "🏪",
    title: "Offline businesses are losing to online",
    desc: "E-commerce wins on data. Now you can too — with zero tech complexity, built for the offline world.",
    accent: "#0b1f3a",
  },
  {
    icon: "💸",
    title: "Acquiring new customers costs 5x more",
    desc: "Retention is your highest-ROI channel. Custva makes it systematic, trackable, and automatic.",
    accent: "#ffd400",
  },
  {
    icon: "📊",
    title: "Your data is sitting idle right now",
    desc: "Every visit, every purchase is a signal you're missing. Custva turns those signals into revenue.",
    accent: "#0b1f3a",
  },
];

const FEATURES = [
  {
    title: "Customer Intelligence",
    desc: "Capture walk-in profiles, visit frequency, average spend, and lifetime value from one unified dashboard.",
    num: "01",
    icon: "👤",
  },
  {
    title: "WhatsApp Campaigns",
    desc: "Send personalized, segmented WhatsApp messages at scale. Schedule, queue, and track delivery in real time.",
    num: "02",
    icon: "💬",
  },
  {
    title: "Retention Analytics",
    desc: "Measure repeat rate, inactive cohorts, and campaign ROI with clarity. Know exactly what's working.",
    num: "03",
    icon: "📈",
  },
  {
    title: "Audience Segmentation",
    desc: "Filter by recency, spend, location, or visit count. Target the right customers at the right moment.",
    num: "04",
    icon: "🎯",
  },
  {
    title: "Workflow Automation",
    desc: "Automate follow-ups, re-engagement sequences, and milestone rewards without any manual effort.",
    num: "05",
    icon: "⚡",
  },
  {
    title: "Secure & Compliant",
    desc: "Built on Indian infrastructure. DPDP-aligned data handling with role-based access controls.",
    num: "06",
    icon: "🔒",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Capture walk-in data",
    desc: "Log customer name, phone, spend, and visit details at checkout — takes under 10 seconds.",
    icon: "📥",
  },
  {
    step: "02",
    title: "Segment your audience",
    desc: "Filter by spend bracket, inactivity window, location, or visit frequency in a few clicks.",
    icon: "🎯",
  },
  {
    step: "03",
    title: "Launch WhatsApp campaigns",
    desc: "Create personalised messages, schedule sends, and let Custva handle queue delivery.",
    icon: "💬",
  },
  {
    step: "04",
    title: "Measure and optimise",
    desc: "Track repeat visits, campaign conversions, and retention trends from one clean dashboard.",
    icon: "📊",
  },
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
    value: "custva.business@gmail.com",
    href: "mailto:custva.business@gmail.com",
    desc: "We respond within 24 hours on business days.",
    id: "contact-email",
    icon: "✉️",
  },
  {
    label: "Call Us",
    value: "+91 82706 57119",
    href: "tel:+918270657119",
    desc: "Mon – Sat, 10:00 AM to 7:00 PM IST",
    id: "contact-phone",
    icon: "📞",
  },
];

/* ─── COMPONENT ─────────────────────────────────────── */
export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <main className="lp-shell">

      {/* ══ NAV ══════════════════════════════════════════ */}
      <header className="lp-nav">
        <Link href="/" className="lp-nav-brand-img">
          <Image
            src="/custva-large-logo.png"
            alt="Custva"
            width={140}
            height={44}
            className="lp-logo-img"
            priority
          />
        </Link>
        <nav className="lp-nav-links" aria-label="Primary navigation">
          {NAV_LINKS.map((l) => (
            <a key={l.label} href={l.href} className="lp-nav-link">
              {l.label}
            </a>
          ))}
        </nav>
        <Link href="/login" className="lp-nav-login" id="nav-login-btn">
          Login →
        </Link>
      </header>

      {/* ══ HERO ═════════════════════════════════════════ */}
      <section className="lp-hero" id="hero">
        {/* Yellow blob accent */}
        <div className="lp-hero-blob" aria-hidden="true" />

        <div className="lp-hero-inner">
          <div className="lp-hero-text">
            {/* Eyebrow pill */}
            <div className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />
              Customer Retention OS for Offline India
            </div>

            <h1 className="lp-hero-heading">
              We grow your revenue by increasing{" "}
              <span className="lp-hero-hl">customer retention</span>
            </h1>

            <p className="lp-hero-sub">
              Custva helps cafes, restaurants, bakeries, salons, and retail
              stores to increase revenue — through smarter retention.
            </p>

            {/* CTA row: mascot left + button right */}
            <div className="lp-hero-cta-row">
              <div className="lp-mascot-block">
                <Image
                  src="/custva-loopy.png"
                  alt="Loopy — Custva mascot"
                  width={100}
                  height={100}
                  className="lp-mascot"
                  priority
                />
              </div>
              <div className="lp-cta-block">
                <Link href="/login" className="lp-cta-btn" id="hero-demo-btn">
                  Book a Free Demo
                </Link>
                <span className="lp-setup-note">⚡ Set up in just 10 minutes</span>
              </div>
            </div>

            {/* Business type tags */}
            <div className="lp-biz-tags">
              {BUSINESSES.map((b) => (
                <span key={b} className="lp-biz-tag">{b}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ STATS STRIP ══════════════════════════════════ */}
      <section className="lp-stats-strip" id="stats" aria-label="Key metrics">
        {STATS.map((s) => (
          <div key={s.label} className="lp-stat-item">
            <span className="lp-stat-value">{s.value}</span>
            <span className="lp-stat-label">{s.label}</span>
          </div>
        ))}
      </section>

      {/* ══ WHY NOW ══════════════════════════════════════ */}
      <section className="lp-section lp-why-now" id="why-now">
        <div className="lp-section-head">
          <span className="lp-tag">Why Now?</span>
          <h2 className="lp-section-title">The perfect time to systemise retention</h2>
          <p className="lp-section-sub">
            The market is shifting fast. Here's why the best offline businesses are acting now.
          </p>
        </div>
        <div className="lp-why-grid">
          {WHY_NOW.map((item, i) => (
            <div
              key={item.title}
              className={`lp-why-card ${i % 2 === 1 ? "lp-why-card--dark" : ""}`}
            >
              <span className="lp-why-icon">{item.icon}</span>
              <h3 className="lp-why-title">{item.title}</h3>
              <p className="lp-why-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FEATURES ═════════════════════════════════════ */}
      <section className="lp-section" id="features">
        <div className="lp-section-head">
          <span className="lp-tag">Platform Features</span>
          <h2 className="lp-section-title">
            Everything your business needs to retain more customers
          </h2>
          <p className="lp-section-sub">
            One platform. Zero complexity. Built specifically for offline Indian merchants.
          </p>
        </div>
        <div className="lp-features-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="lp-feature-card">
              <div className="lp-feature-top">
                <span className="lp-feature-emoji">{f.icon}</span>
                <span className="lp-feature-num">{f.num}</span>
              </div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-desc">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ══ OUR PRODUCT IN ACTION ════════════════════════ */}
      <section className="lp-section lp-product-section" id="product">
        <div className="lp-section-head">
          <span className="lp-tag">Our Product in Action</span>
          <h2 className="lp-section-title">
            See exactly how Custva works for your business
          </h2>
          <p className="lp-section-sub">
            A clean, powerful dashboard built for speed. No training required.
          </p>
        </div>
        <div className="lp-product-showcase">
          {/* Workflow layer badges */}
          <div className="lp-workflow-badges">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="lp-wf-badge">
                <span className="lp-wf-badge-icon">{s.icon}</span>
                <span className="lp-wf-badge-step">{s.step}</span>
                <span className="lp-wf-badge-title">{s.title}</span>
              </div>
            ))}
          </div>
          <div className="lp-product-frame">
            <Image
              src="/product-dashboard.png"
              alt="Custva Dashboard — customer retention analytics"
              width={1200}
              height={700}
              className="lp-product-img"
            />
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════ */}
      <section className="lp-section lp-hiw-section" id="how-it-works">
        <div className="lp-section-head">
          <span className="lp-tag">How It Works</span>
          <h2 className="lp-section-title">Live in minutes. Results in weeks.</h2>
          <p className="lp-section-sub">
            No complex setup. No IT team required. Just four steps to a retention machine.
          </p>
        </div>
        <div className="lp-hiw-grid">
          {HOW_IT_WORKS.map((step, i) => (
            <article key={step.step} className="lp-hiw-step">
              <div className="lp-hiw-num-wrap">
                <span className="lp-hiw-emoji">{step.icon}</span>
                <span className="lp-hiw-num">{step.step}</span>
              </div>
              <h3 className="lp-hiw-title">{step.title}</h3>
              <p className="lp-hiw-desc">{step.desc}</p>
              {i < HOW_IT_WORKS.length - 1 && (
                <span className="lp-hiw-arrow" aria-hidden="true">→</span>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ══ FAQ ══════════════════════════════════════════ */}
      <section className="lp-section lp-faq-section" id="faq">
        <div className="lp-section-head">
          <span className="lp-tag">FAQ</span>
          <h2 className="lp-section-title">Common questions, answered.</h2>
        </div>
        <div className="lp-faq-list">
          {FAQS.map((item, i) => (
            <article key={item.q} className="lp-faq-item">
              <button
                className="lp-faq-q"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
                id={`faq-q-${i}`}
              >
                <span>{item.q}</span>
                <span className={`lp-faq-chevron ${openFaq === i ? "open" : ""}`}>▾</span>
              </button>
              {openFaq === i && (
                <p className="lp-faq-a">{item.a}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ══ CONNECT WITH US ══════════════════════════════ */}
      <section className="lp-section lp-contact-section" id="contact">
        <div className="lp-section-head">
          <span className="lp-tag">Connect With Us</span>
          <h2 className="lp-section-title">We are here to help</h2>
          <p className="lp-section-sub">
            Have a question or want to know if Custva is right for your business?
            Reach out — our team responds quickly.
          </p>
        </div>
        <div className="lp-contact-grid">
          {CONTACT_METHODS.map((c) => (
            <a key={c.id} href={c.href} id={c.id} className="lp-contact-card">
              <span className="lp-contact-icon">{c.icon}</span>
              <span className="lp-contact-label">{c.label}</span>
              <span className="lp-contact-value">{c.value}</span>
              <p className="lp-contact-desc">{c.desc}</p>
              <span className="lp-contact-cta">Get in touch →</span>
            </a>
          ))}
        </div>
      </section>

      {/* ══ FINAL CTA ════════════════════════════════════ */}
      <section className="lp-final-cta">
        <div className="lp-final-cta-inner">
          <span className="lp-tag lp-tag--dark">Get Started Today</span>
          <h2 className="lp-final-title">Ready to make retention a system?</h2>
          <p className="lp-final-sub">
            Join Indian merchants using Custva to grow through repeat customers.
            Free trial, no credit card needed.
          </p>
          <Link href="/login" className="lp-cta-btn lp-cta-btn--lg" id="final-cta-signup-btn">
            Book a Free Demo
          </Link>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════ */}
      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div className="lp-footer-brand-col">
            <div className="lp-footer-logo">
              <Image
                src="/custva-large-logo.png"
                alt="Custva"
                width={120}
                height={38}
                className="lp-logo-img"
              />
            </div>
            <p className="lp-footer-tagline">
              Retention intelligence for offline businesses across India.
            </p>
            <span className="lp-footer-badge">🇮🇳 Proudly built in India</span>
          </div>
          <div className="lp-footer-links">
            <div className="lp-footer-col">
              <span className="lp-footer-col-head">Product</span>
              <a href="#features" className="lp-footer-link">Features</a>
              <a href="#how-it-works" className="lp-footer-link">How It Works</a>
              <a href="#faq" className="lp-footer-link">FAQ</a>
            </div>
            <div className="lp-footer-col">
              <span className="lp-footer-col-head">Company</span>
              <a href="#" className="lp-footer-link">About</a>
              <a href="#" className="lp-footer-link">Blog</a>
              <a href="#" className="lp-footer-link">Careers</a>
            </div>
            <div className="lp-footer-col">
              <span className="lp-footer-col-head">Contact</span>
              <a href="mailto:custva.business@gmail.com" className="lp-footer-link">custva.business@gmail.com</a>
              <a href="tel:+918270657119" className="lp-footer-link">+91 82706 57119</a>
              <span className="lp-footer-link">Mon–Sat, 10 AM – 7 PM</span>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© 2025 Custva. All rights reserved.</span>
          <div className="lp-footer-legal">
            <a href="#" className="lp-footer-legal-link">Privacy Policy</a>
            <a href="#" className="lp-footer-legal-link">Terms of Service</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
