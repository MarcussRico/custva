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

/* The shapes are the conventional flowchart ones, and they are picked to say
   what each step actually is rather than for variety:
   
   parallelogram — input/output. Data entering the system.
   rectangle     — a process. Something is computed.
   hexagon       — a condition. This step really is a decision: is this person
                   late by their own gap? That question is the product.
   stadium       — a terminator. Where the flow comes to rest.
   
   Using them any other way round would be decoration. */
const STEPS = [
  {
    n: "01",
    shape: "input",
    title: "Capture the visit",
    body: "Name, phone and spend, logged at the counter in seconds.",
    accent: "yellow",
  },
  {
    n: "02",
    shape: "process",
    title: "We learn their rhythm",
    body: "How often that person normally comes back, from their own history.",
    accent: "green",
  },
  {
    n: "03",
    shape: "decision",
    title: "Are they late?",
    body: "Past their own usual gap, we send a WhatsApp message in your words. On time, we say nothing.",
    accent: "coral",
  },
  {
    n: "04",
    shape: "end",
    title: "Measure what came back",
    body: "Which returns followed a message, and which were coming anyway.",
    accent: "yellow",
  },
] as const;

/* Each step sits a fixed distance lower than the one before, so the four
   together form a parallelogram, and a curved dotted link runs from the right
   edge of each box to the left edge of the next.
   
   The link lives inside its own step and is positioned into the gutter beside
   it. That is the whole trick: an earlier version drew one long path across
   the section, and because the boxes are opaque all that survived was a few
   disconnected wisps between them. A connector that only ever occupies empty
   space cannot be occluded by anything. */
function Link() {
  return (
    <svg
      className="flow-link"
      viewBox="0 0 60 64"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Left edge to right edge, dropping by exactly the stagger. The
          control points sit on the horizontal at each end, so the curve
          leaves and arrives flat and reads as one continuous line through
          the box it joins. */}
      <path
        d="M0 0 C 26 0, 34 64, 60 64"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Flow() {
  return (
    <div className="flow">
      <ol className="flow-steps">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className="flow-step"
            data-accent={s.accent}
            data-shape={s.shape}
            /* Drives the stagger, so the offset is one value in CSS rather
               than four hand-written margins. */
            style={{ "--step": i } as React.CSSProperties}
            data-reveal
          >
            {/* The clip lives on this wrapper, not on the <li>. clip-path
                clips descendants too, so with it on the <li> the connector
                inside was clipped away — only the one unclipped shape showed
                its link, which looked like three missing lines. */}
            <div className="flow-shape">
              <span className="flow-n">{s.n}</span>
              <h3 className="flow-title">{s.title}</h3>
              <p className="flow-body">{s.body}</p>
            </div>
            {i < STEPS.length - 1 && <Link />}
          </li>
        ))}
      </ol>

      <p className="flow-return">
        <span className="flow-return-mark" aria-hidden="true" />
        They come back, and the next prediction is sharper
      </p>
    </div>
  );
}
