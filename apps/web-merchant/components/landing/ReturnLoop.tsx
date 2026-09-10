"use client";

/* The signature element.
   Custva's logomark is a "C" drawn as a return arrow, and the product is
   literally a loop: a visit is recorded, scheduled WhatsApp messages go out on
   a fixed cadence, and the customer comes back — which starts the loop again at
   a higher visit tier. So the hero shows the mechanism rather than a screenshot
   or a headline metric. Nothing here is a performance claim; the only numbers
   are the day offsets, which come straight from the lifecycle scheduler. */

export const CADENCE = [
  { day: "Day 0", label: "Welcome", note: "Sends five minutes after the visit is recorded" },
  { day: "Day 3", label: "Follow-up", note: "While the visit is still recent" },
  { day: "Day 7", label: "Reminder", note: "A week on, with copy set per tier" },
  { day: "Day 14", label: "Win-back", note: "The last scheduled touch" },
] as const;

/* x positions along the top rail, matched to the label columns below */
const NODE_X = [300, 480, 660, 840];

export function ReturnLoop() {
  return (
    <div className="loop-wrap" data-loop>
      {/* ── Desktop / tablet: the drawn loop ─────────────────────── */}
      <svg
        viewBox="0 0 1040 250"
        className="loop-svg hidden md:block"
        role="img"
        aria-label="A visit is recorded, then scheduled WhatsApp messages go out on day 0, 3, 7 and 14. When the customer returns, the cycle starts again at their new visit tier."
      >
        <defs>
          <linearGradient id="railFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.7" />
            <stop offset="55%" stopColor="var(--color-ink)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--color-coral)" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* the loop itself — one continuous track */}
        <path
          className="loop-track"
          d="M 90 96 H 950 Q 1000 96 1000 136 V 160 Q 1000 200 950 200 H 90 Q 40 200 40 160 V 136 Q 40 96 90 96"
          fill="none"
          stroke="url(#railFade)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* the visit node — where the loop opens and closes */}
        <g className="loop-origin">
          <circle cx="90" cy="96" r="15" fill="var(--color-yellow)" />
          <circle cx="90" cy="96" r="15" className="loop-origin-ring" fill="none"
                  stroke="var(--color-yellow)" strokeWidth="2" />
          <text x="90" y="60" textAnchor="middle" className="loop-origin-label">
            Visit recorded
          </text>
        </g>

        {/* the four scheduled messages */}
        {CADENCE.map((c, i) => (
          <g key={c.day} className="loop-node" data-node={i}>
            <circle cx={NODE_X[i]} cy="96" r="7" fill="var(--color-shell)"
                    stroke="var(--color-ink)" strokeWidth="2" />
            <text x={NODE_X[i]} y="52" textAnchor="middle" className="loop-node-day">
              {c.day}
            </text>
            <text x={NODE_X[i]} y="74" textAnchor="middle" className="loop-node-label">
              {c.label}
            </text>
          </g>
        ))}

        {/* the return leg — the arrow makes the direction of travel explicit,
            echoing the arrowhead in the logomark */}
        <g data-return>
          <text x="520" y="156" textAnchor="middle" className="loop-return-label">
            the customer comes back — and the next cycle starts at their new tier
          </text>
          <path
            d="M 508 200 L 526 192 L 526 208 Z"
            fill="var(--color-coral)"
          />
        </g>
      </svg>

      {/* ── Mobile: the same sequence, stacked and legible ────────── */}
      <ol className="loop-stack md:hidden">
        <li className="loop-stack-origin">
          <span className="loop-stack-dot" aria-hidden="true" />
          <span className="loop-stack-day">Visit recorded</span>
          <span className="loop-stack-note">Name, mobile and spend, at the counter</span>
        </li>
        {CADENCE.map((c) => (
          <li key={c.day}>
            <span className="loop-stack-tick" aria-hidden="true" />
            <span className="loop-stack-day">{c.day}</span>
            <span className="loop-stack-label">{c.label}</span>
            <span className="loop-stack-note">{c.note}</span>
          </li>
        ))}
        <li className="loop-stack-close">
          <span className="loop-stack-note">
            When they come back, the cycle starts again at their new visit tier.
          </span>
        </li>
      </ol>
    </div>
  );
}
