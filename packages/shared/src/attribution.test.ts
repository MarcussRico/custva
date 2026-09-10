import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATTRIBUTION,
  decideAttribution,
  isWithinWindow,
  pickLastTouch,
  type EligibleMessage,
} from "./attribution.js";

const day = 86_400_000;
const ago = (n: number) => new Date(Date.now() - n * day);

const msg = (id: string, daysAgo: number, wasRead = false): EligibleMessage => ({
  id,
  engagedAt: ago(daysAgo),
  wasRead,
});

describe("isWithinWindow — FR-A3", () => {
  const visit = new Date();

  it("accepts a message engaged inside the window", () => {
    assert.equal(isWithinWindow(msg("m", 3), visit), true);
  });

  it("rejects a message older than the window", () => {
    assert.equal(isWithinWindow(msg("m", 9), visit), false);
  });

  it("rejects a message engaged after the visit — it cannot have caused it", () => {
    assert.equal(
      isWithinWindow({ id: "m", engagedAt: new Date(Date.now() + day), wasRead: false }, visit),
      false,
    );
  });

  it("honours a non-default window", () => {
    assert.equal(isWithinWindow(msg("m", 9), visit, 14), true);
  });
});

describe("pickLastTouch — FR-A4", () => {
  it("credits the most recent message", () => {
    const picked = pickLastTouch([msg("old", 6), msg("recent", 1), msg("mid", 3)]);
    assert.equal(picked?.id, "recent");
  });

  it("breaks a tie in favour of the read message", () => {
    const at = ago(2);
    const picked = pickLastTouch([
      { id: "delivered", engagedAt: at, wasRead: false },
      { id: "read", engagedAt: at, wasRead: true },
    ]);
    assert.equal(picked?.id, "read");
  });

  it("returns null when nothing is eligible", () => {
    assert.equal(pickLastTouch([]), null);
  });
});

describe("decideAttribution", () => {
  it("never claims a first visit", () => {
    const d = decideAttribution({
      isFirstVisit: true,
      segmentAtVisit: "first_time",
      eligibleMessage: msg("m", 1),
    });
    assert.equal(d.returnType, "organic");
    assert.equal(d.attributedMessageId, null);
  });

  it("is organic when no message reached them", () => {
    const d = decideAttribution({
      isFirstVisit: false,
      segmentAtVisit: "at_risk",
      eligibleMessage: null,
    });
    assert.equal(d.returnType, "organic");
    assert.match(d.reason, /No Custva message/);
  });

  it("claims an at-risk customer who returned after a message", () => {
    const d = decideAttribution({
      isFirstVisit: false,
      segmentAtVisit: "at_risk",
      eligibleMessage: msg("m1", 2, true),
    });
    assert.equal(d.returnType, "custva_influenced");
    assert.equal(d.attributedMessageId, "m1");
    assert.match(d.reason, /overdue/);
  });

  it("claims a dormant win-back", () => {
    const d = decideAttribution({
      isFirstVisit: false,
      segmentAtVisit: "dormant",
      eligibleMessage: msg("m2", 5),
    });
    assert.equal(d.returnType, "custva_influenced");
  });

  it("claims a first-time visitor's second visit after nurture — FR-A6", () => {
    const d = decideAttribution({
      isFirstVisit: false,
      segmentAtVisit: "first_time",
      eligibleMessage: msg("m3", 3),
    });
    assert.equal(d.returnType, "custva_influenced");
  });

  it("SHIELDS a loyal regular even though a message was delivered — FR-A5", () => {
    /* The rule the entire pricing argument rests on. A regular who was coming
       back anyway must not be billed for, or the merchant's objection in §2.1
       is correct and the invoice is indefensible. */
    const d = decideAttribution({
      isFirstVisit: false,
      segmentAtVisit: "loyal",
      eligibleMessage: msg("m4", 1, true),
    });
    assert.equal(d.returnType, "organic");
    assert.equal(d.attributedMessageId, null);
    assert.match(d.reason, /loyal regular and due back anyway/);
  });

  it("is organic when the segment is unknown", () => {
    const d = decideAttribution({
      isFirstVisit: false,
      segmentAtVisit: null,
      eligibleMessage: msg("m5", 1),
    });
    assert.equal(d.returnType, "organic");
  });

  it("records the window it actually used, for NFR-4 immutability", () => {
    const d = decideAttribution({
      isFirstVisit: false,
      segmentAtVisit: "at_risk",
      eligibleMessage: msg("m6", 1),
      windowDays: 14,
    });
    assert.equal(d.windowDays, 14);
  });

  it("defaults to the §17 baseline window", () => {
    const d = decideAttribution({
      isFirstVisit: false,
      segmentAtVisit: "at_risk",
      eligibleMessage: null,
    });
    assert.equal(d.windowDays, ATTRIBUTION.windowDays);
    assert.equal(d.windowDays, 7);
  });

  it("always explains itself in plain language", () => {
    for (const segment of ["first_time", "loyal", "at_risk", "dormant"] as const) {
      const d = decideAttribution({
        isFirstVisit: false,
        segmentAtVisit: segment,
        eligibleMessage: msg("m", 1),
      });
      assert.ok(d.reason.length > 20, `${segment} produced no usable reason`);
      assert.doesNotMatch(d.reason, /undefined|null|NaN/);
    }
  });
});
