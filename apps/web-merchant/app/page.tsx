"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./landing.css";

import { Mark, Wordmark, IconArrowRight } from "../components/landing/brand";
import { ReturnLoop } from "../components/landing/ReturnLoop";
import { useLandingMotion } from "../components/landing/motion";

/* One page, read in under a minute. Everything that needed a click, a tab or a
   second paragraph has been taken out — what is left is what a shop owner needs
   to decide whether to reply. */

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Why now", href: "#why" },
  { label: "Questions", href: "#questions" },
];

const STEPS = [
  {
    n: "01",
    title: "Log the visit",
    body: "Name, mobile, what they spent. Ten seconds at the counter.",
  },
  {
    n: "02",
    title: "We learn their rhythm",
    body: "How often that person normally comes back, from their own history.",
  },
  {
    n: "03",
    title: "They go quiet, we message",
    body: "A WhatsApp message with a picture, in your words, when they are actually late.",
  },
];

/* WhatsApp last, as asked. */
const WHY = [
  "A shop sees the same faces every week and remembers none of them. Online shops remember everything.",
  "Winning back someone who already likes you costs less than finding someone new.",
  "WhatsApp is where your customers already are — no app, no new habit. They opt in first.",
];

const QUESTIONS = [
  {
    q: "What does it cost to send?",
    a: "Meta charges per conversation. Custva adds a daily cap so a mistake cannot run up a bill.",
  },
  {
    q: "Do customers have to agree?",
    a: "Yes. Only customers who opt in are messaged.",
  },
  {
    q: "Is it finished?",
    a: "No. It works end to end, but it is an MVP and we would rather say so.",
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
        <h1 className="display-xl mt-5 max-w-[16ch]">
          <span className="block" data-hero-line>
            Know who comes back.
          </span>
          <span className="block" data-hero-line>
            And who <span className="swash">stopped</span>.
          </span>
        </h1>

        <p className="lede mt-12" data-hero-sub>
          Custva remembers your customers, notices when a regular goes quiet,
          and sends the WhatsApp follow-up for you.
        </p>

        <div className="mt-9" data-hero-cta>
          <a href="#contact" className="btn btn-primary">
            Talk to us <IconArrowRight className="w-[18px] h-[18px]" />
          </a>
        </div>

        <ReturnLoop />
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="how">
        <p className="instrument eyebrow" data-reveal>
          How it works
        </p>
        <h2 className="display-lg max-w-[14ch]" data-reveal>
          Three things
        </h2>

        <div className="step-list mt-12">
          {STEPS.map((s) => (
            <div key={s.n} className="step-item hoverable" data-reveal>
              <span className="step-n">{s.n}</span>
              <div>
                <h3 className="why-title">{s.title}</h3>
                <p className="why-desc">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why now ───────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="why">
        <p className="instrument eyebrow" data-reveal>
          Why now
        </p>
        <ul className="why-list mt-8">
          {WHY.map((w) => (
            <li key={w} data-reveal>
              {w}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Questions ─────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="questions">
        <p className="instrument eyebrow" data-reveal>
          Questions
        </p>
        <div className="mt-8">
          {QUESTIONS.map((q) => (
            <div key={q.q} className="answer-row" data-reveal>
              <p className="answer-q">{q.q}</p>
              <p className="answer-a">{q.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────────── */}
      <section className="shell band band-line pt-20" id="contact">
        <h2 className="display-lg max-w-[14ch]" data-reveal>
          Come and see it
        </h2>
        <div className="mt-8 flex flex-col gap-3" data-reveal>
          <a href="tel:+916380288707" className="contact-link">
            +91 63802 88707
          </a>
          <a
            href="mailto:custva.business@gmail.com"
            className="contact-link text-[1rem]"
          >
            custva.business@gmail.com
          </a>
        </div>
      </section>

      <footer className="footer">
        <div className="shell flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Mark size={16} />
            <span className="text-[0.85rem] text-ink-soft">
              © {new Date().getFullYear()} Custva
            </span>
          </div>
          <Link href="/login" className="footer-link">
            Merchant log in
          </Link>
        </div>
      </footer>
    </main>
  );
}
