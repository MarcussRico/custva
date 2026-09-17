"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./landing.css";

import {
  Mark,
  Wordmark,
  IconArrowRight,
  IconBubble,
  IconClock,
  IconCoin,
  IconCounter,
  IconFilter,
  IconPeople,
  IconStore,
  IconTrend,
} from "../components/landing/brand";
import { ReturnLoop } from "../components/landing/ReturnLoop";
import { Segments } from "../components/landing/Segments";
import { useLandingMotion } from "../components/landing/motion";

/* The original landing page's copy, in the current design language.
   Changes asked for: the positioning line, no stats strip, Why Now with
   WhatsApp last and no emoji, no "Our Product in Action", the real flow in
   How It Works, a nav that reaches every section, and the new number. */

/* Order mirrors the page, so the nav is a map rather than a menu. */
const NAV = [
  { label: "Why now", href: "#why-now" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Segments", href: "#segments" },
  { label: "Features", href: "#features" },
  { label: "Contact", href: "#contact" },
];

const BUSINESSES = [
  "Cafes",
  "Restaurants",
  "Bakeries",
  "Salons",
  "Retail stores",
  "Gyms",
];

const FEATURES = [
  {
    Icon: IconPeople,
    title: "Customer Intelligence",
    body: "Capture walk-in profiles, visit frequency, and average spend from one unified dashboard.",
  },
  {
    Icon: IconBubble,
    title: "WhatsApp Campaigns",
    body: "Send personalised, segmented WhatsApp messages at scale. Schedule, queue, and track delivery in real time.",
  },
  {
    Icon: IconTrend,
    title: "Retention Analytics",
    body: "Measure repeat rate, inactive cohorts, and campaign results with clarity. Know exactly what's working.",
  },
  {
    Icon: IconFilter,
    title: "Audience Segmentation",
    body: "Filter by recency, spend, or visit count. Target the right customers at the right moment.",
  },
  {
    Icon: IconClock,
    title: "Workflow Automation",
    body: "Automate follow-ups, re-engagement sequences, and milestone rewards without any manual effort.",
  },
  {
    Icon: IconCounter,
    title: "Built for the counter",
    body: "A POS-style capture screen your staff can use between customers. No training required.",
  },
];

/* WhatsApp moved to last, emoji replaced with the drawn icon set. */
const WHY_NOW = [
  {
    Icon: IconStore,
    title: "Offline businesses are losing to online",
    body: "E-commerce wins on data. Now you can too — with zero tech complexity, built for the offline world.",
  },
  {
    Icon: IconCoin,
    title: "Acquiring new customers costs more than keeping them",
    body: "Retention is your highest-ROI channel. Custva makes it systematic, trackable, and automatic.",
  },
  {
    Icon: IconTrend,
    title: "Your data is sitting idle right now",
    body: "Every visit, every purchase is a signal you're missing. Custva turns those signals into action.",
  },
  {
    Icon: IconBubble,
    title: "WhatsApp is where your customers already are",
    body: "Reach them instantly — no new app, no friction, no downloads. They opt in first.",
  },
];

const FAQS = [
  {
    q: "Who is Custva built for?",
    a: "Offline businesses — cafes, restaurants, bakeries, salons, gyms, and local retail stores that want to grow through repeat customers.",
  },
  {
    q: "Do my customers need to download an app?",
    a: "No. Custva works entirely via WhatsApp. Your customers receive messages on their existing number — zero friction, zero downloads. They do have to opt in first.",
  },
  {
    q: "What does the messaging cost?",
    a: "Meta bills per conversation through the WhatsApp Cloud API, and Custva does not change that. What it adds is a daily cap per business, so a mistake cannot run up a bill.",
  },
  {
    q: "How is customer data stored?",
    a: "In a Postgres database belonging to the deployment, with every query scoped to your business and sessions held in httpOnly cookies. The hosting region is chosen when your instance is set up — ask us where yours would run.",
  },
  {
    q: "Can I use Custva for multiple outlets?",
    a: "Not yet. One account is one business today — no branch split, no per-outlet reporting. If you run several, tell us, because it changes what we build next.",
  },
];

export default function LandingPage() {
  const root = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);

  useLandingMotion(root);

  useEffect(() => {
    const onScrollY = () => setStuck(window.scrollY > 8);
    onScrollY();
    window.addEventListener("scroll", onScrollY, { passive: true });
    return () => window.removeEventListener("scroll", onScrollY);
  }, []);

  return (
    <main className="landing" ref={root}>
      <div className="shell">
        <header className="nav" data-stuck={stuck}>
          <Link href="/" aria-label="Custva home" className="flex items-center">
            <Wordmark width={112} />
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {NAV.map((l) => (
              <a key={l.href} href={l.href} className="nav-link">
                {l.label}
              </a>
            ))}
          </nav>
          {/* Log in sits top right, where a returning merchant looks for it.
              Kept quiet next to the demo button: the page is selling to people
              who do not have an account yet, and the two must not compete. */}
          <div className="nav-actions">
            <Link href="/login" className="nav-login">
              Log in
            </Link>
            <a href="#contact" className="btn btn-primary">
              Book a demo
            </a>
          </div>
        </header>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="shell band">
        <p className="instrument" data-hero-line>
          Customer intelligence for business
        </p>
        <h1 className="display-xl mt-5 max-w-[17ch]">
          <span className="block" data-hero-line>
            We grow your revenue
          </span>
          <span className="block" data-hero-line>
            by increasing{" "}
            <span className="swash">customer retention</span>
          </span>
        </h1>

        <p className="lede mt-12" data-hero-sub>
          Custva helps cafes, restaurants, bakeries, salons, and retail stores
          increase revenue — through smarter retention.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3" data-hero-cta>
          <a href="#contact" className="btn btn-primary">
            Book a demo <IconArrowRight className="w-[18px] h-[18px]" />
          </a>
          <a href="#how-it-works" className="btn btn-ghost">
            How it works
          </a>
        </div>

        <div className="biz-tags mt-8" data-hero-cta>
          {BUSINESSES.map((b) => (
            <span key={b} className="biz-tag">
              {b}
            </span>
          ))}
        </div>

        <ReturnLoop />
      </section>

      {/* ── Why now ────────────────────────────────────────────────
           An argument, so it is set as one: four claims, each on its own
           rule, no icons. The icon grid belongs to Features and appearing in
           both is what made the two sections indistinguishable. */}
      <section className="shell band band-line pt-20" id="why-now">
        <p className="instrument eyebrow" data-reveal>
          Why now
        </p>
        <h2 className="display-lg max-w-[22ch]" data-reveal>
          The perfect time to systemise retention
        </h2>

        <div className="claims mt-12">
          {WHY_NOW.map((w) => (
            <div key={w.title} className="claim" data-reveal>
              <h3 className="claim-title">{w.title}</h3>
              <p className="claim-body">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="how-it-works">
        <p className="instrument eyebrow" data-reveal>
          How it works
        </p>
        <h2 className="display-lg max-w-[20ch]" data-reveal>
          Log the visit. We do the rest.
        </h2>
        <p className="lede mt-6" data-reveal>
          A first-timer gets a welcome sequence. Everyone else is left alone
          until they are actually late by their own pattern — so a weekly
          regular who turns up on Friday hears nothing.
        </p>

        <div className="step-list mt-12">
          <div className="step-item hoverable" data-reveal>
            <span className="step-n">01</span>
            <div>
              <h3 className="why-title">Capture walk-in data</h3>
              <p className="why-desc">
                Log customer name, phone, and spend at checkout.
              </p>
            </div>
          </div>
          <div className="step-item hoverable" data-reveal>
            <span className="step-n">02</span>
            <div>
              <h3 className="why-title">We learn their rhythm</h3>
              <p className="why-desc">
                How often that person normally comes back, from their own visit
                history.
              </p>
            </div>
          </div>
          <div className="step-item hoverable" data-reveal>
            <span className="step-n">03</span>
            <div>
              <h3 className="why-title">They go quiet, we message</h3>
              <p className="why-desc">
                A WhatsApp message with a picture, in your words, when they have
                missed their normal visit.
              </p>
            </div>
          </div>
          <div className="step-item hoverable" data-reveal>
            <span className="step-n">04</span>
            <div>
              <h3 className="why-title">Measure and optimise</h3>
              <p className="why-desc">
                Track repeat visits and which returns followed a message, from
                one dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Segments ───────────────────────────────────────────────
           The signature. Every other section on this page is words about the
           product; this one is the product's actual output, drawn. It sits
           immediately after the flow because the flow ends at "we learn their
           rhythm" and this is what that produces. */}
      <section className="shell band band-line pt-20" id="segments">
        <p className="instrument eyebrow" data-reveal>
          What we work out
        </p>
        <h2 className="display-lg max-w-[24ch]" data-reveal>
          Four states, read from each customer&apos;s own rhythm
        </h2>
        <p className="lede mt-6 max-w-[54ch]" data-reveal>
          The gap between someone&apos;s last visit and today is the whole
          decision. Here is what that looks like.
        </p>

        <Segments />
      </section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="features">
        <p className="instrument eyebrow" data-reveal>
          Platform features
        </p>
        <h2 className="display-lg max-w-[22ch]" data-reveal>
          Everything your business needs to retain more customers
        </h2>

        <div className="grid-2 mt-12">
          {FEATURES.map((f) => (
            <article key={f.title} className="card tilt" data-reveal data-tilt>
              <f.Icon className="feature-icon" />
              <h3 className="display-md">{f.title}</h3>
              <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-soft">
                {f.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="faq">
        <p className="instrument eyebrow" data-reveal>
          FAQ
        </p>
        <h2 className="display-lg max-w-[18ch]" data-reveal>
          Common questions, answered
        </h2>

        {/* Collapsed. Five answers laid open read as page content and pad the
            page out with text nobody asked for; closed, they are there for the
            one reader who wants them.

            Native <details>, not a JS accordion: it opens with no script, it
            is keyboard-operable for free, and ctrl-F still finds the text
            inside a closed one in most browsers. */}
        <div className="faq mt-10">
          {FAQS.map((f) => (
            <details key={f.q} className="faq-item" data-reveal>
              <summary className="faq-q">
                <span>{f.q}</span>
                <span className="faq-sign" aria-hidden="true" />
              </summary>
              <p className="faq-a">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="contact">
        <div className="cta-panel">
          <div>
            <p className="instrument eyebrow" data-reveal>
              Connect with us
            </p>
            <h2 className="display-lg max-w-[16ch]" data-reveal>
              Ready to make retention a system?
            </h2>
            <p className="lede mt-5" data-reveal>
              Have a question, or want to know if Custva is right for your
              business? Reach out — we respond quickly.
            </p>
          </div>

          <div className="flex flex-col gap-3" data-reveal>
            <a href="tel:+916380288707" className="contact-link">
              +91 63802 88707
            </a>
            <a
              href="mailto:custva.business@gmail.com"
              className="contact-link text-[1rem]"
            >
              custva.business@gmail.com
            </a>
            <span className="instrument mt-1">Mon–Sat · 10:00–19:00 IST</span>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="shell flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-[30ch]">
            <Wordmark width={110} />
            <p className="mt-4 text-[0.93rem] text-ink-soft">
              Retention intelligence for offline businesses across India.
            </p>
            <p className="instrument mt-5">Built in India</p>
          </div>
          <div className="flex gap-14">
            <div>
              <p className="instrument mb-2">Product</p>
              {NAV.map((l) => (
                <a key={l.href} href={l.href} className="footer-link">
                  {l.label}
                </a>
              ))}
            </div>
            <div>
              <p className="instrument mb-2">Contact</p>
              <a href="tel:+916380288707" className="footer-link">
                +91 63802 88707
              </a>
              <a href="mailto:custva.business@gmail.com" className="footer-link">
                custva.business@gmail.com
              </a>
              <Link href="/login" className="footer-link">
                Merchant log in
              </Link>
            </div>
          </div>
        </div>

        <div className="shell mt-12 flex items-center gap-2.5 border-t border-[color:var(--rule-soft)] pt-6">
          <Mark size={16} />
          <span className="text-[0.85rem] text-ink-soft">
            © {new Date().getFullYear()} Custva. All rights reserved.
          </span>
        </div>
      </footer>
    </main>
  );
}
