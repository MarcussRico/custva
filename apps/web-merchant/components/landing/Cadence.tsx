"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger, utils } from "animejs";

/* The lifecycle grid, for someone who has never seen a CRM.

   The previous version put all sixteen messages on screen at once as a
   4x4 matrix, which reads as a spreadsheet. Showing one tier at a time
   turns it into a single customer's fortnight: four moments, in order,
   with the timing said in words rather than implied by a column header.

   Copy is the seeded template text from
   infra/db/migrations/0010_lifecycle_templates.sql, with the {{shop_name}}
   placeholder resolved to an example shop so nobody has to decode braces. */

const SHOP = "Filter Room";

const WHEN = [
  { day: "Day 0", plain: "Five minutes after they leave" },
  { day: "Day 3", plain: "Three days later" },
  { day: "Day 7", plain: "A week later" },
  { day: "Day 14", plain: "Two weeks later" },
];

const TIERS = [
  {
    key: "first",
    tab: "1st visit",
    who: "Someone who has just been in for the first time.",
    cells: [
      { h: `Welcome to ${SHOP}!`, n: "Thanks for your first visit" },
      { h: "We hope you enjoyed it", n: "Come back for something special" },
      { h: "A week since we met!", n: "We'd love to see you again" },
      { h: "We miss you", n: "Drop by for a loyalty surprise" },
    ],
  },
  {
    key: "second",
    tab: "2nd visit",
    who: "They came back once. Worth saying so.",
    cells: [
      { h: "Welcome back!", n: "Thank you for returning" },
      { h: "Thanks for being a regular", n: "A little thank-you" },
      { h: "Your loyalty matters", n: "Something for loyal guests" },
      { h: `Come back to ${SHOP}`, n: "We've saved a treat for you" },
    ],
  },
  {
    key: "third",
    tab: "3rd visit",
    who: "Three visits in. They are a regular now.",
    cells: [
      { h: "You are a regular now!", n: "Your third visit means a lot" },
      { h: "VIP appreciation", n: "Loyal guests make us special" },
      { h: "We value your loyalty", n: "A VIP surprise is waiting" },
      { h: "Your table awaits", n: "Come back for your reward" },
    ],
  },
  {
    key: "fourth",
    tab: "4th visit +",
    who: "Your best customers. Every visit from here uses this set.",
    cells: [
      { h: "Champion guest!", n: "One of our best guests" },
      { h: "Champion appreciation", n: "An exclusive offer for you" },
      { h: "Champion loyalty reward", n: "We miss our champion guests" },
      { h: "Champion comeback", n: "Your champion reward is saved" },
    ],
  },
];

export function Cadence() {
  const [active, setActive] = useState(0);
  const cardsRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  /* Re-deal the four cards when the tier changes. Skipped on first paint —
     the scroll reveal owns that one. */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = cardsRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>(".step-card");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      utils.set(cards, { opacity: 1, translateY: 0 });
      return;
    }
    animate(cards, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 420,
      ease: "outQuad",
      delay: stagger(55),
      onComplete: () => {
        cards.forEach((c) => {
          c.style.transform = "";
        });
      },
    });
  }, [active]);

  const tier = TIERS[active];

  return (
    <div className="cadence">
      {/* which set of four you are looking at */}
      <div className="tier-tabs" role="tablist" aria-label="Visit number">
        {TIERS.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={i === active}
            className={`tier-tab ${i === active ? "tier-tab--on" : ""}`}
            onClick={() => setActive(i)}
          >
            {t.tab}
          </button>
        ))}
      </div>

      <p className="tier-who">{tier.who}</p>

      {/* the fortnight, in order */}
      <div className="step-row" ref={cardsRef}>
        {tier.cells.map((c, i) => (
          <div className="step-card" key={`${tier.key}-${i}`}>
            <span className="step-rail" aria-hidden="true" />
            <p className="instrument step-day">{WHEN[i].day}</p>
            <p className="step-when">{WHEN[i].plain}</p>
            <p className="step-head">{c.h}</p>
            <p className="step-note">{c.n}</p>
          </div>
        ))}
      </div>

      <p className="cadence-foot">
        The four moments are the same whoever they are — only the wording
        changes. Your shop name and each customer&apos;s name are filled in
        automatically, so &ldquo;{SHOP}&rdquo; above becomes yours.
      </p>
    </div>
  );
}
