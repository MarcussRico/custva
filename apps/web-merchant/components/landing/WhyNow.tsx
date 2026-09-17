import {
  IconBubble,
  IconCoin,
  IconStore,
  IconTrend,
} from "./brand";

/**
 * Why now, as full-bleed alternating blocks.
 *
 * The reference was dark near-black panels alternating with light ones, big
 * bold headings, an icon above each. Two changes to it, both deliberate.
 *
 * The dark is the brand navy rather than black — #011244 is what the logomark
 * is drawn in, and pure black next to a warm paper ground reads as a different
 * site's component pasted in.
 *
 * And the icons are the drawn set, not emoji. Emoji render as a different
 * typeface at a different weight on every platform, and on Android some of
 * these arrive as a completely different picture.
 *
 * Each block carries one vibrant accent, cycling through the palette, used on
 * the icon and the rule above the heading. One accent per block rather than
 * several, so the colour marks the block instead of decorating it.
 */

const BLOCKS = [
  {
    Icon: IconStore,
    accent: "yellow",
    title: "Offline businesses are losing to online",
    body: "E-commerce wins on data. Now you can too, with zero tech complexity, built for the offline world.",
  },
  {
    Icon: IconCoin,
    accent: "coral",
    title: "Acquiring new customers costs more than keeping them",
    body: "Retention is your highest-ROI channel. Custva makes it systematic, trackable, and automatic.",
  },
  {
    Icon: IconTrend,
    accent: "green",
    title: "Your data is sitting idle right now",
    body: "Every visit, every purchase is a signal you're missing. Custva turns those signals into action.",
  },
  {
    Icon: IconBubble,
    accent: "yellow",
    title: "WhatsApp is where your customers already are",
    body: "Reach them instantly. No new app, no friction, no downloads. They opt in first.",
  },
] as const;

export function WhyNow() {
  return (
    <div className="why-blocks">
      {BLOCKS.map((b, i) => (
        <div
          key={b.title}
          className="why-block"
          /* Alternating, and stated in the markup rather than inferred with
             :nth-child, so reordering the list cannot silently produce two
             dark blocks in a row. */
          data-tone={i % 2 === 0 ? "dark" : "light"}
          data-accent={b.accent}
        >
          <div className="shell why-block-inner" data-reveal>
            <b.Icon className="why-block-icon" />
            <span className="why-block-rule" aria-hidden="true" />
            <h3 className="why-block-title">{b.title}</h3>
            <p className="why-block-body">{b.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
