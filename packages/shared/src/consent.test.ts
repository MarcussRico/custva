import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONSENT,
  canMessage,
  classifyInbound,
  describeConsent,
  stateAfter
} from "./consent.js";

describe("classifyInbound", () => {
  it("reads a bare STOP as a withdrawal", () => {
    assert.equal(classifyInbound("STOP"), "withdrawn");
    assert.equal(classifyInbound("stop"), "withdrawn");
  });

  it("ignores punctuation, emoji and stray whitespace around the keyword", () => {
    /* Real replies look like this. A customer who asks to be left alone must
       not stay subscribed because they used a full stop. */
    for (const raw of ["STOP.", " stop ", "Stop!!", "stop 🙏", "STOP!", "  STOP\n"]) {
      assert.equal(classifyInbound(raw), "withdrawn", `failed on ${JSON.stringify(raw)}`);
    }
  });

  it("does NOT treat a message that merely contains 'stop' as a withdrawal", () => {
    /* The reason this is matched whole rather than as a substring. Substring
       matching would delete a real customer's consent on the strength of a
       compliment, and nobody would ever find out why the messages stopped. */
    const compliments = [
      "Do not stop making these brownies",
      "please dont stop the friday offer",
      "I couldn't stop eating them",
      "one stop shop for coffee"
    ];
    for (const raw of compliments) {
      assert.equal(classifyInbound(raw), null, `wrongly opted out: ${raw}`);
    }
  });

  it("reads START and its variants as a fresh grant", () => {
    assert.equal(classifyInbound("START"), "granted");
    assert.equal(classifyInbound("resume"), "granted");
    assert.equal(classifyInbound("Subscribe"), "granted");
  });

  it("understands the languages these customers actually reply in", () => {
    /* Tamil Nadu merchants. Their customers do not all reply in English, and an
       opt-out in Tamil is an opt-out. */
    assert.equal(classifyInbound("வேண்டாம்"), "withdrawn");
    assert.equal(classifyInbound("நிறுத்து"), "withdrawn");
    assert.equal(classifyInbound("बंद करो"), "withdrawn");
    assert.equal(classifyInbound("शुरू करो"), "granted");
  });

  it("returns null for ordinary conversation", () => {
    for (const raw of ["Hi", "Is the shop open today?", "thanks!", "👍", ""]) {
      assert.equal(classifyInbound(raw), null, `misread: ${JSON.stringify(raw)}`);
    }
  });

  it("survives a missing or non-string body", () => {
    /* Meta sends image, location and button messages with no `text.body`. */
    assert.equal(classifyInbound(null), null);
    assert.equal(classifyInbound(undefined), null);
    assert.equal(classifyInbound(123 as unknown as string), null);
  });
});

describe("canMessage", () => {
  it("never messages someone who asked to stop", () => {
    assert.equal(canMessage("withdrawn"), false);
  });

  it("messages someone who agreed", () => {
    assert.equal(canMessage("granted"), true);
  });

  it("never messages someone with no consent record", () => {
    /* The Meta go-live position, now settled. A send to an `unknown` customer
       is a message to someone who never agreed: Meta treats it as an opt-in
       violation and the DPDP Act as processing without consent, and it is the
       merchant's own number that absorbs the complaint.
       
       Asserted as a literal rather than against the constant. While the policy
       was still open, comparing to `CONSENT.allowUnknown` let the test track it;
       now that it is decided, a test that follows the constant would silently
       approve flipping it back. */
    assert.equal(canMessage("unknown"), false);
    assert.equal(CONSENT.allowUnknown, false);
  });

  it("keeps withdrawal absolute regardless of the unknown policy", () => {
    assert.equal(CONSENT.neverMessage.includes("withdrawn"), true);
  });
});

describe("stateAfter", () => {
  it("maps each ledger action to the state it leaves behind", () => {
    assert.equal(stateAfter("granted"), "granted");
    assert.equal(stateAfter("withdrawn"), "withdrawn");
  });
});

describe("describeConsent", () => {
  it("says plainly that nothing is recorded, rather than implying consent", () => {
    /* "Not opted out" would read as permission. It is not. */
    assert.equal(describeConsent("unknown"), "No consent recorded");
  });

  it("dates a grant when the date is known", () => {
    const text = describeConsent("granted", new Date("2026-03-04T10:00:00Z"));
    assert.match(text, /Agreed to WhatsApp messages on 4 Mar 2026/);
  });

  it("uses the customer's own words, not the system's", () => {
    assert.match(describeConsent("withdrawn"), /Asked to stop/);
    assert.doesNotMatch(describeConsent("withdrawn"), /withdrawn|opt|revoke/i);
  });

  it("does not invent a date it does not have", () => {
    const text = describeConsent("granted", null);
    assert.doesNotMatch(text, / on /);
  });
});
