import Image from "next/image";

/* The real Custva marks.
   The supplied PNGs baked the yellow field into the bitmap, so they could not
   sit on a light page. These are the same artwork with that field removed and
   the alpha recovered from the navy/yellow ramp — 12K and 40K instead of 935K
   each. Faithful to the brand rather than a redraw of it. */

export function Mark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/custva-mark.png"
      alt=""
      width={size}
      height={Math.round((size * 279) / 256)}
      className={className}
      priority
    />
  );
}

export function Wordmark({
  width = 132,
  className = "",
}: {
  width?: number;
  className?: string;
}) {
  return (
    <Image
      src="/custva-wordmark.png"
      alt="Custva"
      width={width}
      height={Math.round((width * 134) / 640)}
      className={className}
      priority
    />
  );
}

/* ── Icons ──────────────────────────────────────────────────────────────
   Drawn to match the mark: round caps, round joins, one stroke weight. */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function IconCounter({ className }: IconProps) {
  /* a counter with a bill on it — where a visit gets recorded */
  return (
    <svg {...base} className={className}>
      <path d="M3 20h18" />
      <path d="M5 20v-6h14v6" />
      <rect x="8.5" y="3.5" width="7" height="7.5" rx="1.4" />
      <path d="M10.5 6.2h3M10.5 8.4h3" />
    </svg>
  );
}

export function IconPeople({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.4 19.2a5.8 5.8 0 0 1 11.2 0" />
      <path d="M16.2 5.5a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.6 14.6a5.8 5.8 0 0 1 3 4.6" />
    </svg>
  );
}

export function IconBubble({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20.5 11.6c0 4.1-3.8 7.4-8.5 7.4a9.7 9.7 0 0 1-2.7-.38L4.5 20.5l1.2-3.5A7 7 0 0 1 3.5 11.6c0-4.1 3.8-7.4 8.5-7.4s8.5 3.3 8.5 7.4Z" />
      <path d="M8.8 11.6h6.4M8.8 8.9h4.2" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.4V12l3.2 2" />
    </svg>
  );
}

export function IconFilter({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export function IconShield({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.4l6.6 2.5v5.3c0 4-2.7 7.6-6.6 9-3.9-1.4-6.6-5-6.6-9V5.9Z" />
      <path d="M9.4 12.1l1.9 1.9 3.4-3.6" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.6 3.8 7.8 12 12l8.2-4.2Z" />
      <path d="m4.6 12.4 7.4 3.8 7.4-3.8" />
      <path d="m4.6 16.8 7.4 3.8 7.4-3.8" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5" />
    </svg>
  );
}
