import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOLDOUT, assignHoldout, computeLift } from "./holdout.js";

const audience = (n: number, segment = "at_risk") =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, segment }));

describe("assignHoldout", () => {
  it("holds out roughly the requested share", () => {
    const r = assignHoldout(audience(1000), { campaignId: "camp1", percent: 10 });
    assert.ok(
      r.holdout.length > 60 && r.holdout.length < 140,
      `expected ~100 held out, got ${r.holdout.length}`,
    );
    assert.equal(r.treatment.length + r.holdout.length, 1000);
  });

  it("is deterministic — a retried send must not reshuffle the arms", () => {
    /* If a retry reassigned, some customers would be messaged twice and the
       experiment would be destroyed. */
    const a = assignHoldout(audience(500), { campaignId: "camp1" });
    const b = assignHoldout(audience(500), { campaignId: "camp1" });
    assert.deepEqual(
      a.holdout.map((c) => c.id),
      b.holdout.map((c) => c.id),
    );
  });

  it("splits differently for a different campaign", () => {
    const a = assignHoldout(audience(500), { campaignId: "camp1" });
    const b = assignHoldout(audience(500), { campaignId: "camp2" });
    assert.notDeepEqual(
      a.holdout.map((c) => c.id),
      b.holdout.map((c) => c.id),
    );
  });

  it("never holds out a loyal customer", () => {
    /* Holding back a regular measures nothing — FR-A5 already treats their
       return as organic — and costs a message that was never billable. */
    const mixed = [...audience(200, "at_risk"), ...audience(200, "loyal")];
    const r = assignHoldout(mixed, { campaignId: "camp1" });
    assert.equal(r.holdout.filter((c) => c.segment === "loyal").length, 0);
  });

  it("skips the holdout entirely for a small audience", () => {
    const r = assignHoldout(audience(40), { campaignId: "camp1" });
    assert.equal(r.holdout.length, 0);
    assert.equal(r.treatment.length, 40);
    assert.match(r.skippedReason ?? "", /at least 100/);
  });

  it("respects a merchant who has turned holdouts off", () => {
    const r = assignHoldout(audience(1000), { campaignId: "c", percent: 0 });
    assert.equal(r.holdout.length, 0);
    assert.match(r.skippedReason ?? "", /disabled/);
  });

  it("counts only influenceable customers toward the minimum", () => {
    /* 200 people, but 180 are loyal — only 20 could be influenced, so a
       holdout would be measuring almost nothing. */
    const mixed = [...audience(20, "at_risk"), ...audience(180, "loyal")];
    const r = assignHoldout(mixed, { campaignId: "c" });
    assert.equal(r.holdout.length, 0);
    assert.match(r.skippedReason ?? "", /Only 20 customers/);
  });
});

describe("computeLift", () => {
  it("reports a real difference in the merchant's own language", () => {
    const r = computeLift({
      treatmentSize: 400,
      treatmentReturned: 92,
      holdoutSize: 100,
      holdoutReturned: 14,
    });
    assert.ok(r.liftPoints !== null && r.liftPoints > 0);
    assert.equal(r.confident, true);
    assert.match(r.verdict, /came back on their own/);
    assert.ok((r.incrementalReturns ?? 0) > 0);
  });

  it("refuses to state a lift with no holdout", () => {
    const r = computeLift({
      treatmentSize: 400,
      treatmentReturned: 92,
      holdoutSize: 0,
      holdoutReturned: 0,
    });
    assert.equal(r.liftPoints, null);
    assert.equal(r.confident, false);
    assert.match(r.verdict, /nothing to compare against/);
  });

  it("refuses to state a lift on a tiny sample", () => {
    /* 10 vs 3 could show a 30-point "lift" from a single extra visit. */
    const r = computeLift({
      treatmentSize: 10,
      treatmentReturned: 4,
      holdoutSize: 3,
      holdoutReturned: 0,
    });
    assert.equal(r.liftPoints, null);
    assert.match(r.verdict, /Too few customers/);
  });

  it("calls a difference unproven when it is inside normal variation", () => {
    const r = computeLift({
      treatmentSize: 100,
      treatmentReturned: 22,
      holdoutSize: 100,
      holdoutReturned: 19,
    });
    assert.equal(r.confident, false);
    assert.match(r.verdict, /unproven/);
    /* the number is still reported, just not claimed */
    assert.ok(r.liftPoints !== null);
  });

  it("says so plainly when a campaign did nothing", () => {
    const r = computeLift({
      treatmentSize: 500,
      treatmentReturned: 100,
      holdoutSize: 200,
      holdoutReturned: 60,
    });
    assert.ok((r.liftPoints ?? 0) < 0);
    assert.match(r.verdict, /did not cause additional returns|unproven/);
  });

  it("never claims more incremental returns than actually returned", () => {
    const r = computeLift({
      treatmentSize: 400,
      treatmentReturned: 92,
      holdoutSize: 100,
      holdoutReturned: 14,
    });
    assert.ok((r.incrementalReturns ?? 0) <= 92);
  });

  it("exposes the raw counts so the merchant can check the arithmetic", () => {
    const r = computeLift({
      treatmentSize: 400,
      treatmentReturned: 92,
      holdoutSize: 100,
      holdoutReturned: 14,
    });
    assert.equal(r.treatment.size, 400);
    assert.equal(r.treatment.returned, 92);
    assert.equal(r.holdout.size, 100);
    assert.equal(r.holdout.returned, 14);
  });

  it("uses the documented minimum per arm", () => {
    const r = computeLift({
      treatmentSize: HOLDOUT.minPerArmToReport,
      treatmentReturned: 10,
      holdoutSize: HOLDOUT.minPerArmToReport,
      holdoutReturned: 5,
    });
    assert.notEqual(r.liftPoints, null);
  });
});

describe("holdout assignment is unbiased", () => {
  it("holds out close to the requested share across many audience shapes", () => {
    /* The original FNV-1a hash without a finaliser produced ~2.7% when asked
       for 10%, because consecutive near-identical keys mapped to a narrow band
       of the output range. A systematically undersized holdout silently biases
       every lift number computed from it. */
    /* Tolerance is three binomial standard deviations, not a flat band —
       a random split of 200 people genuinely varies more than a split of
       10,000, and a fixed ±3pt band would fail honestly-correct behaviour at
       small n while passing broken behaviour at large n. */
    for (const size of [200, 520, 1000, 3000, 10000]) {
      const r = assignHoldout(audience(size), { campaignId: "c", percent: 10 });
      const expected = size * 0.1;
      const sd = Math.sqrt(size * 0.1 * 0.9);
      assert.ok(
        Math.abs(r.holdout.length - expected) <= 3 * sd,
        `audience ${size}: expected ${expected.toFixed(0)}±${(3 * sd).toFixed(0)} held out, got ${r.holdout.length}`,
      );
    }
  });

  it("tracks the requested percentage, not just some fixed fraction", () => {
    const low = assignHoldout(audience(2000), { campaignId: "c", percent: 5 });
    const high = assignHoldout(audience(2000), { campaignId: "c", percent: 25 });
    assert.ok(low.holdout.length < high.holdout.length / 3);
  });
});
