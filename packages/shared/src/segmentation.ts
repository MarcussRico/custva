/**
 * Customer segmentation — SRS Feature-Implementation.md §7.
 *
 * Deliberately pure and deterministic. TR-1 requires the v1 rules be auditable
 * rather than a model, and NFR-1 requires the outcome be explainable to a cafe
 * owner in plain language — hence `explainSegment`.
 *
 * These functions are the single source of truth for the rules. The periodic
 * sweep and the visit-write path both call them, rather than each reimplementing
 * the thresholds in SQL, so the two can never drift apart.
 */

export type Segment = "first_time" | "loyal" | "at_risk" | "dormant";

/** §17 open parameters. Extracted so they can move to per-merchant config (NFR-5). */
export const SEGMENT_THRESHOLDS = {
  /** Loyal while within this multiple of their own expected gap. */
  loyalMultiple: 1.25,
  /** At-Risk up to this multiple; beyond it, Dormant. */
  atRiskMultiple: 2.5,
  /** Used when the customer has too little history to have a rhythm. */
  fallbackGapDays: 14,
  /** With thin history, this many days of silence is Dormant regardless of ratio. */
  thinHistoryDormantDays: 60,
  /** Below this many visits we do not trust a customer-specific median. */
  minVisitsForOwnGap: 3,
} as const;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * FR-S2. Days between consecutive visits, most-recent-first order irrelevant.
 * Returns `[]` for fewer than two visits — one visit has no interval.
 */
export function visitIntervalsInDays(visitDates: Date[]): number[] {
  if (visitDates.length < 2) return [];
  const sorted = [...visitDates].sort((a, b) => a.getTime() - b.getTime());
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days =
      (sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000;
    out.push(days);
  }
  return out;
}

/**
 * FR-S2 cascade: the customer's own median once there is enough history, then
 * the merchant's median, then a flat fallback.
 */
export function computeExpectedGapDays(input: {
  visitDates: Date[];
  merchantMedianGapDays?: number | null;
}): { expectedGapDays: number; source: "customer" | "merchant" | "fallback" } {
  const intervals = visitIntervalsInDays(input.visitDates);

  if (input.visitDates.length >= SEGMENT_THRESHOLDS.minVisitsForOwnGap) {
    const own = median(intervals);
    /* A same-day repeat visit yields a 0-day interval; a 0 gap would make every
       ratio infinite and flag the customer Dormant immediately. Floor at 1. */
    if (own != null && own > 0) {
      return { expectedGapDays: Math.max(1, own), source: "customer" };
    }
  }

  if (input.merchantMedianGapDays != null && input.merchantMedianGapDays > 0) {
    return {
      expectedGapDays: Math.max(1, input.merchantMedianGapDays),
      source: "merchant",
    };
  }

  return {
    expectedGapDays: SEGMENT_THRESHOLDS.fallbackGapDays,
    source: "fallback",
  };
}

export function expectedRevisitAt(
  lastVisit: Date,
  expectedGapDays: number,
): Date {
  return new Date(lastVisit.getTime() + expectedGapDays * 86_400_000);
}

/**
 * FR-S3. Exactly one segment per customer (FR-S1).
 *
 * NOTE — a gap in the spec. FR-S3 requires `total_visits >= 3` for Loyal and
 * `> 1.25x` for At-Risk, which leaves a customer with exactly 2 visits who is
 * *on time* matching no rule at all. §14's business-rule summary does not cover
 * it either. We classify them `loyal`, which is the conservative reading: Loyal
 * is the segment that receives no discount (BR-2) and generates no commission
 * (FR-A5), so an ambiguous customer costs the merchant nothing and is not
 * billed for. Recorded as an open question in PROGRESS.md — it is a product
 * decision, not an engineering one.
 */
export function classifySegment(input: {
  totalVisits: number;
  daysSinceLastVisit: number;
  expectedGapDays: number;
}): Segment {
  const { totalVisits, daysSinceLastVisit, expectedGapDays } = input;

  if (totalVisits <= 1) return "first_time";

  const gap = Math.max(1, expectedGapDays);
  const ratio = daysSinceLastVisit / gap;
  const thinHistory = totalVisits < SEGMENT_THRESHOLDS.minVisitsForOwnGap;

  if (
    ratio > SEGMENT_THRESHOLDS.atRiskMultiple ||
    (thinHistory &&
      daysSinceLastVisit >= SEGMENT_THRESHOLDS.thinHistoryDormantDays)
  ) {
    return "dormant";
  }

  if (ratio > SEGMENT_THRESHOLDS.loyalMultiple) return "at_risk";

  return "loyal";
}

/** NFR-1 — the reason a cafe owner reads, not the ratio. */
export function explainSegment(input: {
  segment: Segment;
  totalVisits: number;
  daysSinceLastVisit: number;
  expectedGapDays: number;
}): string {
  const gap = Math.round(input.expectedGapDays);
  const days = Math.round(input.daysSinceLastVisit);

  switch (input.segment) {
    case "first_time":
      return "Has been in once. Not enough history to know their rhythm yet.";
    case "loyal":
      return `Comes in roughly every ${gap} days and it has been ${days} — they are on schedule.`;
    case "at_risk":
      return `Usually back within ${gap} days, but it has been ${days}. They have missed their normal visit.`;
    case "dormant":
      return `Usually back within ${gap} days. It has been ${days} — long enough that they may not return on their own.`;
  }
}

export interface SegmentComputation {
  segment: Segment;
  expectedGapDays: number;
  expectedRevisitAt: Date | null;
  gapSource: "customer" | "merchant" | "fallback";
  explanation: string;
}

/** Everything the visit-write path and the sweep need, in one call. */
export function computeSegmentation(input: {
  visitDates: Date[];
  totalVisits: number;
  lastVisit: Date | null;
  merchantMedianGapDays?: number | null;
  now?: Date;
}): SegmentComputation {
  const now = input.now ?? new Date();
  const { expectedGapDays, source } = computeExpectedGapDays({
    visitDates: input.visitDates,
    merchantMedianGapDays: input.merchantMedianGapDays,
  });

  const daysSinceLastVisit = input.lastVisit
    ? (now.getTime() - input.lastVisit.getTime()) / 86_400_000
    : 0;

  const segment = classifySegment({
    totalVisits: input.totalVisits,
    daysSinceLastVisit,
    expectedGapDays,
  });

  return {
    segment,
    expectedGapDays,
    expectedRevisitAt: input.lastVisit
      ? expectedRevisitAt(input.lastVisit, expectedGapDays)
      : null,
    gapSource: source,
    explanation: explainSegment({
      segment,
      totalVisits: input.totalVisits,
      daysSinceLastVisit,
      expectedGapDays,
    }),
  };
}

/**
 * When to nudge someone who has a known rhythm.
 *
 * The fixed day 0/3/7/14 grid is the right tool for a first-time visitor —
 * there is no rhythm to measure yet. For anyone else it nags people who are not
 * late: a customer who comes monthly gets "we miss you" on day 3, day 7 and day
 * 14 while perfectly on schedule. That is wasted spend and it is how a sending
 * number earns blocks and reports.
 *
 * These offsets are the segment boundaries themselves, so a nudge fires exactly
 * when the customer *becomes* At-Risk, and again before they tip into Dormant.
 * A regular who returns on time is cancelled out of both and receives nothing —
 * which is the point.
 */
export function rhythmNudgeOffsetsDays(expectedGapDays: number): number[] {
  const gap = Math.max(1, expectedGapDays);
  return [
    gap * SEGMENT_THRESHOLDS.loyalMultiple,
    gap * SEGMENT_THRESHOLDS.atRiskMultiple,
  ];
}
