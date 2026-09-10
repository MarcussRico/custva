import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEGMENT_THRESHOLDS,
  classifySegment,
  computeExpectedGapDays,
  computeSegmentation,
  median,
  visitIntervalsInDays,
  rhythmNudgeOffsetsDays,
} from "./segmentation.js";

const day = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * day);

describe("median", () => {
  it("returns the middle value for an odd count", () => {
    assert.equal(median([7, 3, 5]), 5);
  });
  it("averages the two middle values for an even count", () => {
    assert.equal(median([2, 4, 6, 8]), 5);
  });
  it("returns null for no values", () => {
    assert.equal(median([]), null);
  });
});

describe("visitIntervalsInDays", () => {
  it("has no interval for a single visit", () => {
    assert.deepEqual(visitIntervalsInDays([daysAgo(3)]), []);
  });
  it("is insensitive to input ordering", () => {
    const dates = [daysAgo(0), daysAgo(14), daysAgo(7)];
    assert.deepEqual(visitIntervalsInDays(dates), [7, 7]);
  });
});

describe("computeExpectedGapDays — FR-S2 cascade", () => {
  it("uses the customer's own median once there are three visits", () => {
    const r = computeExpectedGapDays({
      visitDates: [daysAgo(21), daysAgo(14), daysAgo(7)],
      merchantMedianGapDays: 30,
    });
    assert.equal(r.expectedGapDays, 7);
    assert.equal(r.source, "customer");
  });

  it("falls back to the merchant median with thin history", () => {
    const r = computeExpectedGapDays({
      visitDates: [daysAgo(10), daysAgo(3)],
      merchantMedianGapDays: 9,
    });
    assert.equal(r.expectedGapDays, 9);
    assert.equal(r.source, "merchant");
  });

  it("falls back to 14 days when there is nothing to go on", () => {
    const r = computeExpectedGapDays({ visitDates: [daysAgo(1)] });
    assert.equal(r.expectedGapDays, SEGMENT_THRESHOLDS.fallbackGapDays);
    assert.equal(r.source, "fallback");
  });

  it("never returns a zero gap for same-day repeat visits", () => {
    /* Three visits on one day gives a median interval of 0. Left unguarded,
       every ratio becomes Infinity and the customer is instantly Dormant. */
    const t = new Date();
    const r = computeExpectedGapDays({ visitDates: [t, t, t] });
    assert.ok(r.expectedGapDays > 0, "a zero gap makes every ratio infinite");
  });
});

describe("classifySegment — FR-S3 thresholds", () => {
  it("one visit is First-Time", () => {
    assert.equal(
      classifySegment({ totalVisits: 1, daysSinceLastVisit: 200, expectedGapDays: 7 }),
      "first_time",
    );
  });

  it("on schedule is Loyal", () => {
    assert.equal(
      classifySegment({ totalVisits: 5, daysSinceLastVisit: 7, expectedGapDays: 7 }),
      "loyal",
    );
  });

  it("exactly on the 1.25x bound is still Loyal, not At-Risk", () => {
    assert.equal(
      classifySegment({ totalVisits: 5, daysSinceLastVisit: 8.75, expectedGapDays: 7 }),
      "loyal",
    );
  });

  it("past 1.25x is At-Risk — the missed-rhythm signal", () => {
    assert.equal(
      classifySegment({ totalVisits: 5, daysSinceLastVisit: 12, expectedGapDays: 7 }),
      "at_risk",
    );
  });

  it("exactly on the 2.5x bound is still At-Risk, not Dormant", () => {
    assert.equal(
      classifySegment({ totalVisits: 5, daysSinceLastVisit: 17.5, expectedGapDays: 7 }),
      "at_risk",
    );
  });

  it("past 2.5x is Dormant", () => {
    assert.equal(
      classifySegment({ totalVisits: 5, daysSinceLastVisit: 30, expectedGapDays: 7 }),
      "dormant",
    );
  });

  it("thin history plus 60 days of silence is Dormant even at a low ratio", () => {
    /* Two visits, fallback 90-day gap: ratio is only 0.7, but 63 days of
       silence from someone we barely know is Dormant per FR-S3. */
    assert.equal(
      classifySegment({ totalVisits: 2, daysSinceLastVisit: 63, expectedGapDays: 90 }),
      "dormant",
    );
  });

  it("classifies the case FR-S3 leaves undefined: two visits, on time", () => {
    /* Loyal needs >=3 visits; At-Risk needs >1.25x. A 2-visit on-time customer
       matches neither. We choose Loyal deliberately — it is the segment that
       gets no discount and generates no commission, so an ambiguous customer
       is never billed for. Flagged as a product decision. */
    assert.equal(
      classifySegment({ totalVisits: 2, daysSinceLastVisit: 5, expectedGapDays: 7 }),
      "loyal",
    );
  });
});

describe("computeSegmentation", () => {
  it("gives the Friday-coffee regular who missed a week At-Risk", () => {
    /* The example the whole product is built around. */
    const r = computeSegmentation({
      visitDates: [daysAgo(28), daysAgo(21), daysAgo(14)],
      totalVisits: 3,
      lastVisit: daysAgo(14),
    });
    assert.equal(r.expectedGapDays, 7);
    assert.equal(r.gapSource, "customer");
    assert.equal(r.segment, "at_risk");
    assert.match(r.explanation, /missed their normal visit/);
  });

  it("leaves expectedRevisitAt null when there is no last visit", () => {
    const r = computeSegmentation({
      visitDates: [],
      totalVisits: 0,
      lastVisit: null,
    });
    assert.equal(r.expectedRevisitAt, null);
    assert.equal(r.segment, "first_time");
  });

  it("puts expected revisit exactly one gap after the last visit", () => {
    const last = daysAgo(2);
    const r = computeSegmentation({
      visitDates: [daysAgo(16), daysAgo(9), last],
      totalVisits: 3,
      lastVisit: last,
    });
    const expected = last.getTime() + r.expectedGapDays * day;
    assert.equal(r.expectedRevisitAt?.getTime(), expected);
  });

  it("explains itself without exposing ratios", () => {
    const r = computeSegmentation({
      visitDates: [daysAgo(21), daysAgo(14), daysAgo(7)],
      totalVisits: 3,
      lastVisit: daysAgo(7),
    });
    assert.doesNotMatch(r.explanation, /ratio|multiple|1\.25|2\.5/);
  });
});

describe("rhythmNudgeOffsetsDays — the missed-rhythm trigger", () => {
  it("fires the first nudge exactly when the customer becomes At-Risk", () => {
    const [first] = rhythmNudgeOffsetsDays(7);
    assert.equal(first, 8.75);
    /* the same boundary classifySegment uses, so the nudge and the label agree */
    assert.equal(
      classifySegment({ totalVisits: 5, daysSinceLastVisit: first + 0.1, expectedGapDays: 7 }),
      "at_risk",
    );
  });

  it("fires the second nudge before they tip into Dormant", () => {
    const [, second] = rhythmNudgeOffsetsDays(7);
    assert.equal(second, 17.5);
    assert.equal(
      classifySegment({ totalVisits: 5, daysSinceLastVisit: second, expectedGapDays: 7 }),
      "at_risk",
    );
  });

  it("scales with the individual, not the calendar", () => {
    /* A monthly customer is not nagged on day 3. Under the fixed grid they got
       three nudges while perfectly on schedule. */
    const [first] = rhythmNudgeOffsetsDays(30);
    assert.ok(first > 14, "a monthly customer should not be chased inside a fortnight");
    assert.equal(first, 37.5);
  });
});
