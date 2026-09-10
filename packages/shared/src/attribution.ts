import type { Segment } from "./segmentation.js";

/**
 * Return attribution — SRS Feature-Implementation.md §9.
 *
 * The commercial claim is "we charge only for returns we caused", so this
 * decision is what an invoice rests on. It is deliberately a pure function over
 * explicit inputs: NFR-2 requires every decision be reconstructible from stored
 * fields, which is impossible if the rule reads ambient state.
 *
 * Note honestly what this is: last-touch correlation. A customer who was always
 * coming back on Tuesday, who happened to receive a message on Sunday, is
 * counted as influenced. FR-A5's Loyal shield reduces that error but does not
 * measure it. The holdout arm (migration 0014) is what eventually turns this
 * into a causal number.
 */

export const ATTRIBUTION = {
  /** §17 baseline. Stored per visit so retuning it never rewrites history. */
  windowDays: 7,
  /** FR-A6: segments for which a message is treated as the cause of a return. */
  influenceableSegments: ["first_time", "at_risk", "dormant"] as const,
} as const;

export type ReturnType = "organic" | "custva_influenced";

export interface EligibleMessage {
  id: string;
  /** COALESCE(opened_at, delivered_at) — FR-A3 prefers the open when present. */
  engagedAt: Date;
  wasRead: boolean;
}

export interface AttributionDecision {
  returnType: ReturnType;
  attributedMessageId: string | null;
  windowDays: number;
  /** Plain-language audit trail. NFR-2, and BR-5 wants merchants to see why. */
  reason: string;
}

/**
 * FR-A1/A5/A6.
 *
 * `segmentAtVisit` must be the segment the customer held *before* this visit
 * updated their record. Recording a visit makes someone look more loyal, so
 * reading the segment afterwards would shield essentially every return and
 * nothing would ever be attributed.
 */
export function decideAttribution(input: {
  isFirstVisit: boolean;
  segmentAtVisit: Segment | null;
  eligibleMessage: EligibleMessage | null;
  windowDays?: number;
}): AttributionDecision {
  const windowDays = input.windowDays ?? ATTRIBUTION.windowDays;
  const base = { windowDays, attributedMessageId: null };

  /* A first-ever visit is not a return, so there is nothing to have caused. */
  if (input.isFirstVisit) {
    return {
      ...base,
      returnType: "organic",
      reason: "First visit — there is no return to attribute.",
    };
  }

  if (!input.eligibleMessage) {
    return {
      ...base,
      returnType: "organic",
      reason: `No Custva message reached them in the ${windowDays} days before this visit.`,
    };
  }

  /* FR-A5, the commission shield. A loyal regular returning on schedule is the
     merchant's customer, not ours — even if a message happened to land first.
     This is the single rule that makes the pricing defensible. */
  if (input.segmentAtVisit === "loyal") {
    return {
      ...base,
      returnType: "organic",
      reason:
        "They were a loyal regular and due back anyway, so this return is not claimed even though a message was delivered.",
    };
  }

  if (
    !input.segmentAtVisit ||
    !ATTRIBUTION.influenceableSegments.includes(
      input.segmentAtVisit as (typeof ATTRIBUTION.influenceableSegments)[number],
    )
  ) {
    return {
      ...base,
      returnType: "organic",
      reason: "Not in a segment where a message is treated as the cause.",
    };
  }

  const days = Math.max(
    0,
    Math.round(
      (Date.now() - input.eligibleMessage.engagedAt.getTime()) / 86_400_000,
    ),
  );
  const verb = input.eligibleMessage.wasRead ? "read" : "delivered";

  return {
    windowDays,
    returnType: "custva_influenced",
    attributedMessageId: input.eligibleMessage.id,
    reason: `They were ${labelFor(input.segmentAtVisit)} and came back after a message ${verb} ${days} day(s) earlier.`,
  };
}

function labelFor(segment: Segment): string {
  switch (segment) {
    case "at_risk":
      return "overdue for a visit";
    case "dormant":
      return "long overdue";
    case "first_time":
      return "a first-time visitor";
    case "loyal":
      return "a regular";
  }
}

/**
 * FR-A4 — last touch. Given every delivered/read message inside the window,
 * pick the one to credit.
 *
 * FR-A3 says to prefer the open timestamp over the delivery timestamp when both
 * exist; that choice is already baked into `engagedAt` by the caller. What is
 * left is simply "most recent wins", with a read message breaking a tie because
 * it is the stronger signal.
 */
export function pickLastTouch(
  messages: EligibleMessage[],
): EligibleMessage | null {
  if (!messages.length) return null;
  return [...messages].sort((a, b) => {
    const delta = b.engagedAt.getTime() - a.engagedAt.getTime();
    if (delta !== 0) return delta;
    return Number(b.wasRead) - Number(a.wasRead);
  })[0];
}

/** FR-A3 — the message must have engaged inside `[visit - window, visit]`. */
export function isWithinWindow(
  message: EligibleMessage,
  visitAt: Date,
  windowDays: number = ATTRIBUTION.windowDays,
): boolean {
  const engaged = message.engagedAt.getTime();
  const visit = visitAt.getTime();
  return engaged <= visit && engaged >= visit - windowDays * 86_400_000;
}
