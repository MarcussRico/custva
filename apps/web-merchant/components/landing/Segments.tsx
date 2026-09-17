/**
 * The four behavioural segments, drawn as the visit rhythms that define them.
 *
 * The brief was that the page "looks like a blog" — every section was an
 * eyebrow, a heading, and a list of icon-title-body. Four more cards saying
 * "Overdue: past their usual gap" would have been a fifth copy of the same
 * object.
 *
 * So this does not describe the segments; it shows them. Each row is a real
 * timeline: ticks where the customer visited, and a marker for today. The gap
 * between the last tick and today is the entire definition — evenly spaced
 * means on schedule, a widening gap means overdue, one tick and silence means
 * long gone. A reader understands the model before reading a word of it.
 *
 * It is also the one thing on this page no competitor can copy without first
 * computing per-customer rhythm, which is the actual product.
 */

interface Segment {
  key: string;
  label: string;
  /** Visit positions as a fraction of the track, oldest first. */
  visits: number[];
  /** Where "today" sits on the same track. */
  now: number;
  reading: string;
  note: string;
}

/* Positions are deliberately not tidy. A perfectly even 7-day customer does
   not exist, and drawing one makes the whole thing look like an illustration
   rather than data. */
const SEGMENTS: Segment[] = [
  {
    key: "first_time",
    label: "First visit",
    visits: [0.08],
    now: 0.2,
    reading: "1 visit",
    note: "No rhythm yet. Gets a welcome sequence, then nothing until a pattern exists."
  },
  {
    key: "loyal",
    label: "On schedule",
    visits: [0.06, 0.22, 0.37, 0.54, 0.69, 0.85],
    now: 0.93,
    reading: "every 7d",
    note: "Turning up as normal. Deliberately left alone — and never billed for, because nothing brought them back."
  },
  {
    key: "at_risk",
    label: "Overdue",
    visits: [0.05, 0.19, 0.32, 0.46, 0.58],
    now: 0.92,
    reading: "18d late",
    note: "Past their own usual gap. This is the only moment a message is worth sending."
  },
  {
    key: "dormant",
    label: "Long gone",
    visits: [0.04, 0.13, 0.25],
    now: 0.95,
    reading: "40d late",
    note: "Well past it. Worth one honest attempt, not a campaign."
  }
];

const W = 560;
const H = 34;
const PAD = 6;
const x = (t: number) => PAD + t * (W - PAD * 2);

function Rhythm({ segment }: { segment: Segment }) {
  const last = segment.visits[segment.visits.length - 1];
  return (
    <svg
      className="seg-track"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${segment.label}: ${segment.visits.length} visits, ${segment.reading}`}
    >
      {/* The baseline the whole reading sits on. */}
      <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} className="seg-base" />

      {/* The gap that defines the segment, drawn as an absence rather than
          described. This is the part doing the work. */}
      <line
        x1={x(last)}
        y1={H / 2}
        x2={x(segment.now)}
        y2={H / 2}
        className="seg-gap"
      />

      {segment.visits.map((v, i) => (
        <circle key={i} cx={x(v)} cy={H / 2} r={4.5} className="seg-visit" />
      ))}

      {/* Today. A bar rather than a dot, so it never reads as another visit. */}
      <line
        x1={x(segment.now)}
        y1={5}
        x2={x(segment.now)}
        y2={H - 5}
        className="seg-now"
      />
    </svg>
  );
}

export function Segments() {
  return (
    <div className="seg-board">
      <div className="seg-legend" aria-hidden="true">
        <span><i className="seg-key-visit" /> a visit</span>
        <span><i className="seg-key-now" /> today</span>
      </div>

      <ol className="seg-rows">
        {SEGMENTS.map((s) => (
          <li key={s.key} className={`seg-row seg-row--${s.key}`} data-reveal>
            <div className="seg-head">
              <span className="seg-name">{s.label}</span>
              <span className="seg-reading">{s.reading}</span>
            </div>
            <Rhythm segment={s} />
            <p className="seg-note">{s.note}</p>
          </li>
        ))}
      </ol>

      <p className="seg-foot">
        Every customer sits in one of these, worked out from their own visit
        history — not from a 30-day cut-off applied to everybody.
      </p>
    </div>
  );
}
