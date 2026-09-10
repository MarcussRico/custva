"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./landing.css";

import {
  Mark,
  Wordmark,
  IconCounter,
  IconPeople,
  IconClock,
  IconBubble,
  IconArrowRight,
} from "../components/landing/brand";
import { ArtBrownie, ArtCoffee } from "../components/landing/MessageArt";
import { Cadence } from "../components/landing/Cadence";
import { ReturnLoop } from "../components/landing/ReturnLoop";
import { useLandingMotion } from "../components/landing/motion";

/* ══ CONTENT ══════════════════════════════════════════════════════════
   Every claim is traceable to the repository. Day offsets and tier names
   come from apps/api/src/lib/lifecycle-service.ts; the sixteen headers in
   the grid are verbatim from infra/db/migrations/0010_lifecycle_templates.sql.
   There are no performance figures because there is no data behind any.
═══════════════════════════════════════════════════════════════════════ */

const NAV = [
  { label: "The loop", href: "#loop" },
  { label: "What's in it", href: "#platform" },
  { label: "Where we are", href: "#status" },
  { label: "Questions", href: "#faq" },
];

const CAPABILITIES = [
  {
    Icon: IconCounter,
    title: "Log the visit at the counter",
    body: "Name, mobile, spend. New face and it creates the customer; familiar one and it updates their totals and moves them up a tier.",
  },
  {
    Icon: IconClock,
    title: "The follow-up sends itself",
    body: "Four messages queue the moment you hit save. Come back tomorrow and the pending ones are cancelled and rebuilt around the new visit.",
  },
  {
    Icon: IconPeople,
    title: "A customer list worth opening",
    body: "Filter by recency, spend or visit count. Open anyone and see what their repeat visits have actually been worth.",
  },
  {
    Icon: IconBubble,
    title: "A picture on every message",
    body: "Image, header, body, footer, buttons — Meta's own template structure. The image slot is set per template and sent by the worker, so what lands is your product, not a paragraph.",
  },
];

const LIVE = [
  "Visit capture, customer records, revenue-from-repeat tracking",
  "The full lifecycle grid — four tiers by four day offsets",
  "Campaign dispatch through a job queue, with daily send caps",
  "Template editing for merchants, global catalogue for admins",
  "Email OTP sign-in, merchant and admin in separate apps",
  "Signed WhatsApp webhooks, CORS allowlist, rate-limited auth",
];

const NEXT = [
  "Automated tests across auth, webhooks and the scheduler",
  "Error monitoring and structured logging",
  "A documented backup and restore procedure",
  "Meta-approved template names and production header images",
];

const FAQS = [
  {
    q: "Do my customers need to install anything?",
    a: "No — it arrives in WhatsApp on the number they already use. They do have to opt in first. Custva only schedules follow-ups for customers who have given consent, and quietly skips everyone else.",
  },
  {
    q: "What does the sending cost?",
    a: "Meta bills per conversation through the WhatsApp Cloud API, and Custva does not change that. What it adds is a per-merchant daily cap, so a mis-set campaign cannot run up a bill overnight.",
  },
  {
    q: "Who supplies the images?",
    a: "You do — they should be your product, shot in your shop. Custva stores an image against each template and sends it with the message; the sixteen starter templates ship as copy only, so attaching pictures is part of getting you set up. Meta has to approve any template that carries one.",
  },
  {
    q: "Can I run more than one outlet?",
    a: "Not yet. A merchant account is one business today — no branch split, no per-outlet reporting. If you run several, say so, because it changes what gets built next.",
  },
  {
    q: "Where does the data live?",
    a: "In a Postgres database belonging to the deployment, every query scoped to the merchant that owns the record, sessions in httpOnly cookies. The hosting region is picked when the instance is set up — ask us where yours would run rather than assuming.",
  },
  {
    q: "Is this running in real businesses yet?",
    a: "It's an MVP. The retention loop is complete and works end to end; production hardening isn't finished, and the list above says exactly what's outstanding. That's the honest state of it.",
  },
];

/* ══ PAGE ═════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const root = useRef<HTMLElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
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
      {/* ── Nav ───────────────────────────────────────────────────── */}
      <div className="shell">
        <header className="nav" data-stuck={stuck}>
          <Link href="/" aria-label="Custva home" className="flex items-center">
            <Wordmark width={124} />
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {NAV.map((l) => (
              <a key={l.href} href={l.href} className="nav-link">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="nav-link hidden sm:block">
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
          For cafes, salons, bakeries and local retail
        </p>
        <h1 className="display-xl mt-5 max-w-[17ch]">
          <span className="block" data-hero-line>
            Retention isn&apos;t a
          </span>
          <span className="block" data-hero-line>
            campaign. It&apos;s a <span className="swash">loop</span>.
          </span>
        </h1>

        <p className="lede mt-12" data-hero-sub>
          Someone walks in, you log the visit at the counter, and Custva takes it
          from there — four WhatsApp messages over the next fortnight, each one
          carrying a picture of the thing you want them back for. A first-timer
          and a regular get different words. When they come back, the loop
          restarts one tier up.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3" data-hero-cta>
          <a href="#contact" className="btn btn-primary">
            Book a demo <IconArrowRight className="w-[18px] h-[18px]" />
          </a>
          <a href="#loop" className="btn btn-ghost">
            See how the loop runs
          </a>
        </div>

        <ReturnLoop />
      </section>

      {/* ── The loop, in detail ───────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="loop">
        <div className="max-w-[62ch]">
          <div>
            <p className="instrument eyebrow" data-reveal>
              The loop, in detail
            </p>
            <h2 className="display-lg" data-reveal>
              Four tiers. Four days.
              <br />
              Sixteen messages you write once.
            </h2>
            <p className="lede mt-5" data-reveal>
              A first-timer and a fourth-time regular should not get the same
              words on the same day. Custva ships the whole grid seeded — you
              rewrite the wording, it decides when each one goes.
            </p>
            <p className="lede mt-4" data-reveal>
              And none of them go out as a wall of text. Every message carries an
              image, because &ldquo;this could be on your plate&rdquo; with the
              brownie in the picture does work that a sentence cannot.
            </p>
          </div>
        </div>

        <div className="preview-row mt-12">
            <div className="wa-frame tilt" data-reveal data-tilt>
              <p className="instrument mb-3">Brownie counter · first visit, day 3</p>
              <div className="wa-bubble">
                <div className="wa-media">
                  <ArtBrownie className="wa-media-art" />
                </div>
                <div className="wa-header">This could be on your plate</div>
                <p>
                  Hi Priya, the salted-caramel tray comes out of the oven at four.
                  Worth the walk.
                </p>
                <div className="wa-footer">Until Sunday</div>
                <div className="wa-buttons">
                  <span className="wa-button">Get directions</span>
                </div>
              </div>
            </div>

            <div className="wa-frame tilt" data-reveal data-tilt>
              <p className="instrument mb-3">Coffee bar · fourth visit, day 7</p>
              <div className="wa-bubble">
                <div className="wa-media">
                  <ArtCoffee className="wa-media-art" />
                </div>
                <div className="wa-header">Missed your Friday coffee</div>
                <p>
                  Hi Arjun, no flat white last week — first one&apos;s on us when
                  you&apos;re back.
                </p>
                <div className="wa-footer">Any morning this week</div>
                <div className="wa-buttons">
                  <span className="wa-button">Visit us</span>
                </div>
              </div>
            </div>

            <p className="instrument">
              Examples of copy you would write · the sixteen starter templates
              ship as text, the pictures are yours
            </p>
        </div>

        <div className="mt-14" data-reveal>
          <Cadence />
        </div>

        <p className="instrument mt-8" data-reveal>
          Days are counted from the visit · a new visit cancels the schedule
          from the last one and starts a fresh set
        </p>
      </section>

      {/* ── What's in it ──────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="platform">
        <div className="max-w-[62ch]">
          <p className="instrument eyebrow" data-reveal>
            What&apos;s in it
          </p>
          <h2 className="display-lg" data-reveal>
            Two apps, one counter
          </h2>
        </div>

        <div className="grid-2 mt-12">
          {CAPABILITIES.map((c) => (
            <article key={c.title} className="card tilt" data-reveal data-tilt>
              <c.Icon className="feature-icon" />
              <h3 className="display-md">{c.title}</h3>
              <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-soft">
                {c.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Status ────────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="status">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
          <div>
            <p className="instrument eyebrow" data-reveal>
              Where Custva is
            </p>
            <h2 className="display-lg" data-reveal>
              An MVP, and we&apos;d rather say so
            </h2>
            <p className="lede mt-5" data-reveal>
              The loop is complete and runs end to end. Production hardening
              isn&apos;t finished. If you&apos;re weighing up a pilot you should
              hear that now, not three months in.
            </p>
            <a href="#contact" className="btn btn-ghost mt-7" data-reveal>
              Talk to us about a pilot
            </a>
          </div>

          <div className="card tilt" data-reveal data-tilt>
            <div className="ledger">
              {LIVE.map((item) => (
                <div key={item} className="ledger-row">
                  <span className="ledger-state state-live">Live</span>
                  <span className="text-[0.94rem]">{item}</span>
                </div>
              ))}
              {NEXT.map((item) => (
                <div key={item} className="ledger-row">
                  <span className="ledger-state state-next">Planned</span>
                  <span className="text-[0.94rem] text-ink-soft">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="faq">
        <h2 className="display-lg" data-reveal>
          Straight answers
        </h2>

        <div className="mt-10 max-w-[76ch]">
          {FAQS.map((item, i) => (
            <div key={item.q} className="faq-item" data-reveal>
              <button
                type="button"
                className="faq-q"
                aria-expanded={openFaq === i}
                aria-controls={"faq-a-" + i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span>{item.q}</span>
                <span className="faq-mark" aria-hidden="true" />
              </button>
              <div
                className="faq-a"
                id={"faq-a-" + i}
                data-open={openFaq === i}
              >
                <p>{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="contact">
        <div className="cta-panel">
          <div>
            <h2 className="display-lg max-w-[15ch]" data-reveal>
              See it run on your own counter
            </h2>
            <p className="lede mt-5" data-reveal>
              We&apos;ll walk you through the merchant app, the grid, and what a
              pilot would actually involve. No deck.
            </p>
          </div>
          <div className="flex flex-col gap-2" data-reveal>
            <a
              href="mailto:custva.business@gmail.com"
              className="btn btn-primary"
            >
              custva.business@gmail.com
            </a>
            <a href="tel:+918270657119" className="btn btn-ghost">
              +91 82706 57119
            </a>
            <span className="instrument mt-1">Mon–Sat · 10:00–19:00 IST</span>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="footer">
        <div className="shell flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-[32ch]">
            <Wordmark width={112} />
            <p className="mt-4 text-[0.93rem] text-ink-soft">
              Visit capture and scheduled WhatsApp follow-up for offline
              businesses.
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
              <a
                href="mailto:custva.business@gmail.com"
                className="footer-link"
              >
                custva.business@gmail.com
              </a>
              <a href="tel:+918270657119" className="footer-link">
                +91 82706 57119
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
            © {new Date().getFullYear()} Custva
          </span>
        </div>
      </footer>
    </main>
  );
}
