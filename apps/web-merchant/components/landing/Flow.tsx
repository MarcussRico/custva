/**
 * How it works, as a flowchart.
 *
 * It was four numbered rows, which is a list describing a process rather than
 * a picture of one. A flowchart says the thing a list cannot: that these are
 * connected, that order matters, and — the part that makes this product what
 * it is — that the last step feeds the first.
 *
 * Laid out as a real flow on desktop and a vertical one on phones, because a
 * four-across diagram at 390px is unreadable and turning it into a scroller
 * hides half the flow behind a gesture nobody knows to make.
 *
 * The return path is drawn rather than implied. "Measure and optimise" is not
 * a terminus — a customer who comes back starts the loop again with one more
 * visit of history, which is why the rhythm gets sharper over time. A diagram
 * that ended at step four would be describing a funnel, and this is not one.
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

export function Flow() {
  return (
    <div className="flow">
      <ol className="flow-track">
        {STEPS.map((s, i) => (
          <li key={s.n} className="flow-node" data-accent={s.accent} data-reveal>
            <span className="flow-n">{s.n}</span>
            <h3 className="flow-title">{s.title}</h3>
            <p className="flow-body">{s.body}</p>
            {i < STEPS.length - 1 && (
              /* Between nodes, not after the last one. Decorative — the list
                 order already carries the sequence for a screen reader. */
              <span className="flow-arrow" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>

      <div className="flow-return" aria-hidden="true">
        <span className="flow-return-line" />
        <span className="flow-return-label">
          They come back — and the next prediction is sharper
        </span>
      </div>
    </div>
  );
}
