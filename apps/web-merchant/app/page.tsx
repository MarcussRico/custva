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
import { Cadence } from "../components/landing/Cadence";
import { useLandingMotion } from "../components/landing/motion";

/* ══ CONTENT ══════════════════════════════════════════════════════════
   Built from the original landing page's sections, in the current design
   language. Every claim is traceable to the repository — the day offsets
   and tier names to apps/api/src/lib/lifecycle-service.ts, the template
   copy to infra/db/migrations/0010. There are no performance figures
   because there is no data behind any.
═══════════════════════════════════════════════════════════════════════ */

const NAV = [
  { label: "Who we are", href: "#who" },
  { label: "What we do", href: "#what" },
  { label: "How it works", href: "#how" },
  { label: "Why now", href: "#why" },
  { label: "Questions", href: "#answers" },
  { label: "Contact", href: "#contact" },
];

const WHAT_WE_DO = [
  {
    Icon: IconCounter,
    title: "Capture the visit",
    body: "Name, mobile, spend — at the counter, in seconds. New face and it creates the customer; familiar one and it updates their record.",
  },
  {
    Icon: IconTrend,
    title: "Learn each customer's rhythm",
    body: "How often someone actually comes in, from their own visit history. A weekly regular and a monthly one are not the same customer.",
  },
  {
    Icon: IconClock,
    title: "Notice when they break it",
    body: "Someone overdue by their own pattern is flagged automatically. Nobody has to watch a list.",
  },
  {
    Icon: IconBubble,
    title: "Follow up on WhatsApp",
    body: "A message with a picture, in the words you chose, sent when they are actually late — not on a fixed calendar.",
  },
  {
    Icon: IconFilter,
    title: "Pick who to reach",
    body: "Filter by how recently they visited, what they spend, how often they come. Or leave it to the schedule.",
  },
  {
    Icon: IconPeople,
    title: "See what it earned",
    body: "Revenue from customers who came back on their own, and revenue that followed a message, kept as separate numbers.",
  },
];

/* Reordered per the brief: WhatsApp moved to last. */
const WHY_NOW = [
  {
    Icon: IconStore,
    title: "Offline businesses are losing to online",
    body: "E-commerce wins because it knows who came back and who did not. A counter sees the same faces every week and remembers none of them.",
  },
  {
    Icon: IconCoin,
    title: "Winning someone back costs less than finding someone new",
    body: "It is the cheapest growth available to a small business, and the one nobody has time to do by hand.",
  },
  {
    Icon: IconTrend,
    title: "Your data is already there, doing nothing",
    body: "Every visit and every bill is a signal about whether that person is coming back. Unrecorded, it is just a busy afternoon.",
  },
  {
    Icon: IconBubble,
    title: "WhatsApp is where your customers already are",
    body: "No app to install and no new habit to learn — it arrives where they already read things. They do have to opt in first.",
  },
];

/* Kept as plain text rather than an accordion: fewer moving parts, same
   honesty. These are the questions that decide whether Custva is worth a
   merchant's time. */
const ANSWERS = [
  {
    q: "What does the messaging cost?",
    a: "Meta bills per conversation through the WhatsApp Cloud API, and Custva does not change that. What it adds is a daily cap per business, so a mistake cannot run up a bill overnight.",
  },
  {
    q: "Do customers have to agree to this?",
    a: "Yes. Follow-ups are only scheduled for customers who have opted in, and everyone else is skipped.",
  },
  {
    q: "Can I run more than one outlet?",
    a: "Not yet. One account is one business today — no branch split, no per-outlet reporting.",
  },
  {
    q: "Is this finished?",
    a: "It is an MVP. The loop works end to end; production hardening is not done. If you are considering a pilot, you should hear that now rather than later.",
  },
];

/* ══ PAGE ═════════════════════════════════════════════════════════════ */

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
      {/* ── Nav — every section reachable ─────────────────────────── */}
      <div className="shell">
        <header className="nav" data-stuck={stuck}>
          <Link href="/" aria-label="Custva home" className="flex items-center">
            <Wordmark width={118} />
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {NAV.map((l) => (
              <a key={l.href} href={l.href} className="nav-link">
                {l.label}
              </a>
            ))}
          </nav>
          <a href="#contact" className="btn btn-primary">
            Talk to us
          </a>
        </header>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="shell band">
        <p className="instrument" data-hero-line>
          Customer intelligence for business
        </p>
        <h1 className="display-xl mt-5 max-w-[18ch]">
          <span className="block" data-hero-line>
            Know who comes back.
          </span>
          <span className="block" data-hero-line>
            And who <span className="swash">stopped</span>.
          </span>
        </h1>

        <p className="lede mt-12" data-hero-sub>
          Custva records who walks in, learns how often each person normally
          returns, and tells you the moment someone breaks their own pattern —
          then sends the WhatsApp follow-up for you.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3" data-hero-cta>
          <a href="#how" className="btn btn-primary">
            See how it works <IconArrowRight className="w-[18px] h-[18px]" />
          </a>
          <a href="#contact" className="btn btn-ghost">
            Talk to us
          </a>
        </div>

        <ReturnLoop />
      </section>

      {/* ── Who we are ────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="who">
        <p className="instrument eyebrow" data-reveal>
          Who we are
        </p>
        <h2 className="display-lg max-w-[20ch]" data-reveal>
          A small team building one thing properly
        </h2>
        <p className="lede mt-6" data-reveal>
          Custva is for cafes, salons, bakeries and local retail — businesses
          that see the same people every week and have no way of knowing when
          one of them stops coming.
        </p>
        <p className="lede mt-4" data-reveal>
          We are not trying to be a marketing suite. It does one job: notice
          when a regular goes quiet, and say something about it.
        </p>
      </section>

      {/* ── What we do ────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="what">
        <p className="instrument eyebrow" data-reveal>
          What we do
        </p>
        <h2 className="display-lg max-w-[18ch]" data-reveal>
          Six things, and nothing else
        </h2>

        <div className="grid-2 mt-12">
          {WHAT_WE_DO.map((c) => (
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

      {/* ── How it works ──────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="how">
        <p className="instrument eyebrow" data-reveal>
          How it works
        </p>
        <h2 className="display-lg max-w-[22ch]" data-reveal>
          Four messages, timed to the person
        </h2>
        <p className="lede mt-6" data-reveal>
          A first-timer gets a fixed welcome sequence. Everyone else is left
          alone until they are actually late by their own standard — so a
          weekly regular who turns up on Friday hears nothing at all.
        </p>

        <div className="mt-14" data-reveal>
          <Cadence />
        </div>

        <p className="instrument mt-8" data-reveal>
          Days are counted from the visit · a new visit cancels the schedule
          from the last one and starts a fresh set
        </p>
      </section>

      {/* ── Why now ───────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="why">
        <p className="instrument eyebrow" data-reveal>
          Why now
        </p>
        <h2 className="display-lg max-w-[20ch]" data-reveal>
          The gap is not effort. It is memory.
        </h2>

        <div className="mt-10">
          {WHY_NOW.map((w) => (
            <div key={w.title} className="why-row hoverable" data-reveal>
              <w.Icon className="why-icon" />
              <div>
                <h3 className="why-title">{w.title}</h3>
                <p className="why-desc">{w.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Straight answers ──────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="answers">
        <p className="instrument eyebrow" data-reveal>
          Questions
        </p>
        <h2 className="display-lg max-w-[16ch]" data-reveal>
          Straight answers
        </h2>

        <div className="mt-10">
          {ANSWERS.map((a) => (
            <div key={a.q} className="answer-row" data-reveal>
              <p className="answer-q">{a.q}</p>
              <p className="answer-a">{a.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="contact">
        <div className="cta-panel">
          <div>
            <p className="instrument eyebrow" data-reveal>
              Contact
            </p>
            <h2 className="display-lg max-w-[15ch]" data-reveal>
              See it run on your own counter
            </h2>
            <p className="lede mt-5" data-reveal>
              We will walk you through it and what a pilot would involve.
            </p>
          </div>

          <div className="flex flex-col gap-3" data-reveal>
            <div className="contact-line">
              <a href="tel:+916380288707" className="contact-link">
                +91 63802 88707
              </a>
            </div>
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

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="footer">
        <div className="shell flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-[30ch]">
            <Wordmark width={110} />
            <p className="mt-4 text-[0.93rem] text-ink-soft">
              Customer intelligence for business.
            </p>
            <p className="instrument mt-5">Built in India</p>
          </div>

          <div className="flex gap-14">
            <div>
              <p className="instrument mb-2">Sections</p>
              {NAV.map((l) => (
                <a key={l.href} href={l.href} className="footer-link">
                  {l.label}
                </a>
              ))}
            </div>
            <div>
              <p className="instrument mb-2">Get in touch</p>
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
            © {new Date().getFullYear()} Custva
          </span>
        </div>
      </footer>
    </main>
  );
}
