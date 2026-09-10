/**
 * Holdout measurement — the difference between "we messaged them and they came
 * back" and "we caused them to come back".
 *
 * Not in the SRS. FR-A3 attributes a return to any message delivered in the
 * previous seven days, which is correlation: a merchant can always answer "they
 * would have come back anyway", and last-touch cannot refute it. The Loyal
 * shield (FR-A5) reduces that error without measuring it.
 *
 * A randomised holdout can measure it, because the held-out group *is* the
 * people who would have come back anyway.
 */

export const HOLDOUT = {
  defaultPercent: 10,
  /**
   * Below this many eligible customers a holdout is not worth having: it costs
   * real returns and produces a number too noisy to say anything. A cafe with
   * 40 at-risk customers would hold out 4 — one extra return either way swings
   * the "lift" by 25 points.
   */
  minAudienceForHoldout: 100,
  /** Below this per arm, report no lift at all rather than a misleading one. */
  minPerArmToReport: 30,
} as const;

export type Arm = "treatment" | "holdout";

/**
 * Deterministic pseudo-random assignment.
 *
 * Seeded by campaign + customer so the same campaign always produces the same
 * split — a retried send must not reshuffle who was held out, or the experiment
 * is destroyed and some customers get messaged twice.
 */
function hashToUnitInterval(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  /* FNV-1a alone leaves the high bits poorly mixed for short, near-identical
     keys — and every key here is near-identical by construction
     ("camp:cust-1", "camp:cust-2"…). Taking the top bits of that directly
     produced a holdout roughly a quarter of the size asked for, which would
     bias every experiment run through it. This is murmur3's finaliser, whose
     whole job is to avalanche those bits. */
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface HoldoutAssignment<T> {
  treatment: T[];
  holdout: T[];
  percentUsed: number;
  /** Why no holdout was assigned, when none was. */
  skippedReason?: string;
}

/**
 * Split an audience into treatment and holdout.
 *
 * Only customers who could plausibly be *influenced* are eligible to be held
 * out. Holding back a Loyal customer measures nothing — FR-A5 already treats
 * their return as organic — and costs a message that was never going to be
 * billed anyway.
 */
export function assignHoldout<T extends { id: string; segment?: string | null }>(
  audience: T[],
  input: {
    campaignId: string;
    percent?: number;
    /** Segments whose returns can be attributed at all (FR-A6). */
    influenceableSegments?: readonly string[];
  },
): HoldoutAssignment<T> {
  const percent = input.percent ?? HOLDOUT.defaultPercent;
  const influenceable =
    input.influenceableSegments ?? ["first_time", "at_risk", "dormant"];

  if (percent <= 0) {
    return {
      treatment: audience,
      holdout: [],
      percentUsed: 0,
      skippedReason: "Holdout disabled for this merchant.",
    };
  }

  const eligible = audience.filter(
    (c) => c.segment != null && influenceable.includes(c.segment),
  );

  if (eligible.length < HOLDOUT.minAudienceForHoldout) {
    return {
      treatment: audience,
      holdout: [],
      percentUsed: 0,
      skippedReason:
        `Only ${eligible.length} customers could be influenced by this campaign; ` +
        `a holdout needs at least ${HOLDOUT.minAudienceForHoldout} to produce a ` +
        `number worth trusting. Everyone was messaged.`,
    };
  }

  const threshold = percent / 100;
  const holdout: T[] = [];
  const treatment: T[] = [];

  for (const customer of audience) {
    const isEligible =
      customer.segment != null && influenceable.includes(customer.segment);
    if (!isEligible) {
      treatment.push(customer);
      continue;
    }
    if (hashToUnitInterval(`${input.campaignId}:${customer.id}`) < threshold) {
      holdout.push(customer);
    } else {
      treatment.push(customer);
    }
  }

  return { treatment, holdout, percentUsed: percent };
}

export interface LiftResult {
  treatment: { size: number; returned: number; rate: number };
  holdout: { size: number; returned: number; rate: number };
  /** Percentage points. Can legitimately be negative. */
  liftPoints: number | null;
  /** Returns attributable to the campaign, above what would have happened anyway. */
  incrementalReturns: number | null;
  /** Rough two-proportion z score. Null when the sample is too small. */
  zScore: number | null;
  confident: boolean;
  /** What a merchant should actually be told. */
  verdict: string;
}

/**
 * Compare return rates between the two arms.
 *
 * Deliberately conservative: below `minPerArmToReport` per arm it reports no
 * lift at all rather than a number that looks precise and is not. A confident
 * wrong number is worse here than an honest "not yet" — this figure is what an
 * invoice is argued from.
 */
export function computeLift(input: {
  treatmentSize: number;
  treatmentReturned: number;
  holdoutSize: number;
  holdoutReturned: number;
}): LiftResult {
  const { treatmentSize, treatmentReturned, holdoutSize, holdoutReturned } = input;

  const tRate = treatmentSize ? treatmentReturned / treatmentSize : 0;
  const hRate = holdoutSize ? holdoutReturned / holdoutSize : 0;

  const base = {
    treatment: {
      size: treatmentSize,
      returned: treatmentReturned,
      rate: round(tRate),
    },
    holdout: { size: holdoutSize, returned: holdoutReturned, rate: round(hRate) },
  };

  if (holdoutSize === 0) {
    return {
      ...base,
      liftPoints: null,
      incrementalReturns: null,
      zScore: null,
      confident: false,
      verdict:
        "No holdout was assigned, so there is nothing to compare against. " +
        "Returns here cannot be shown to be caused by the campaign.",
    };
  }

  if (
    treatmentSize < HOLDOUT.minPerArmToReport ||
    holdoutSize < HOLDOUT.minPerArmToReport
  ) {
    return {
      ...base,
      liftPoints: null,
      incrementalReturns: null,
      zScore: null,
      confident: false,
      verdict:
        `Too few customers to measure lift yet (${treatmentSize} messaged, ` +
        `${holdoutSize} held out; ${HOLDOUT.minPerArmToReport} in each is the minimum). ` +
        "Keep running campaigns and this will fill in.",
    };
  }

  const liftPoints = round((tRate - hRate) * 100);
  /* What the campaign added: the extra return rate applied to everyone messaged. */
  const incrementalReturns = Math.round((tRate - hRate) * treatmentSize);

  /* Two-proportion z test against the pooled rate. */
  const pooled =
    (treatmentReturned + holdoutReturned) / (treatmentSize + holdoutSize);
  const se = Math.sqrt(
    pooled * (1 - pooled) * (1 / treatmentSize + 1 / holdoutSize),
  );
  const zScore = se === 0 ? 0 : round((tRate - hRate) / se);
  const confident = Math.abs(zScore) >= 1.96;

  return {
    ...base,
    liftPoints,
    incrementalReturns,
    zScore,
    confident,
    verdict: confident
      ? liftPoints > 0
        ? `Of ${treatmentSize} customers messaged, ${pct(tRate)} came back. ` +
          `Of ${holdoutSize} identical customers left alone, ${pct(hRate)} came back on their own. ` +
          `The campaign caused about ${incrementalReturns} extra visit(s).`
        : `Customers who were messaged came back no more often than those left alone. ` +
          `This campaign did not cause additional returns.`
      : `Messaged customers returned at ${pct(tRate)} against ${pct(hRate)} for those left alone, ` +
        `but the difference is within normal variation for this sample size. ` +
        `Treat it as unproven rather than real.`,
  };
}

function round(n: number): number {
  return Number(n.toFixed(4));
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
