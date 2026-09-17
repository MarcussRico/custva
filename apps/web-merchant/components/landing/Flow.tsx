/**
 * How it works, drawn as a route on a map.
 *
 * Four boxes in a row joined by straight arrows is the shape every generated
 * landing page reaches for. This is a trail instead: one dotted path that
 * winds from the first step to the last, with the steps sitting on it as
 * waypoints, the way a walking route is drawn over terrain. It also answers
 * the contour field in the hero, so the page has one idea rather than two.
 *
 * The cards alternate above and below the line, which is what makes the trail
 * visibly wind rather than sag.
 *
 * The path is `vector-effect="non-scaling-stroke"`, which is the whole reason
 * this works: the SVG is stretched to whatever width the section is, and
 * without it the dashes would stretch with it and come out as uneven dashes
 * of different lengths at every viewport.
 */

const STEPS = [
  {
    n: "01",
    title: "Capture the visit",
    body: "Name, phone and spend, logged at the counter in seconds.",
    accent: "yellow",
  },
  {
    n: "02",
    title: "We learn their rhythm",
    body: "How often that person normally comes back, from their own history.",
    accent: "green",
  },
  {
    n: "03",
    title: "They go quiet, we message",
    body: "A WhatsApp message in your words, when they have missed their normal visit.",
    accent: "coral",
  },
  {
    n: "04",
    title: "Measure what came back",
    body: "Which returns followed a message, and which were coming anyway.",
    accent: "yellow",
  },
] as const;

/* The route runs in its own band above the cards, undulating gently, with a
   station on it per step and a short stem dropping to each card.
   
   The first attempt ran the trail *through* the cards at two heights. The
   cards are opaque, so all that survived was a few disconnected wisps in the
   gutters — the route was there and invisible. Giving it clear air and hanging
   the steps off it means the whole path reads at once, which is the only
   reason to draw a route rather than arrows. */
const TRAIL =
  "M 6 62 C 90 62, 110 26, 190 26 S 330 26, 375 58 S 470 96, 560 74 " +
  "S 690 26, 770 34 S 920 58, 994 44";

/* x positions of the four stations, matched to the card column centres. */
const STATIONS: Array<[number, number]> = [
  [125, 38],
  [375, 58],
  [625, 56],
  [875, 44],
];

export function Flow() {
  return (
    <div className="flow">
      <div className="flow-map">
        <svg
          className="flow-trail"
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path className="flow-trail-line" d={TRAIL} vectorEffect="non-scaling-stroke" />
          {STATIONS.map(([x, y], i) => (
            <g key={i}>
              {/* The stem down to the card. Drawn here rather than in CSS so
                  it starts exactly on the curve. */}
              <line
                className="flow-trail-stem"
                x1={x} y1={y} x2={x} y2={100}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                className="flow-trail-mark"
                cx={x} cy={y} r={6}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>

        <ol className="flow-steps">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flow-step"
              data-accent={s.accent}
              data-reveal
            >
              <span className="flow-n">{s.n}</span>
              <h3 className="flow-title">{s.title}</h3>
              <p className="flow-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <p className="flow-return">
        <span className="flow-return-mark" aria-hidden="true" />
        They come back, and the next prediction is sharper
      </p>
    </div>
  );
}
