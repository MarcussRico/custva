import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptCredential, encryptCredential } from "./credentials.js";

describe("credential encryption", () => {
  const TOKEN = "EAAGm0BsomethingthatlookslikeameterlivedaccesstokenXYZ";

  it("round-trips a token", () => {
    assert.equal(decryptCredential(encryptCredential(TOKEN)), TOKEN);
  });

  it("never stores the token in a recoverable form", () => {
    /* The point of the exercise: a database dump, a backup, or a careless
       SELECT * in a log must not hand over something usable. */
    const stored = encryptCredential(TOKEN);
    assert.doesNotMatch(stored, /EAAG/);
    assert.ok(!stored.includes(TOKEN));
  });

  it("produces different ciphertext each time", () => {
    /* A fresh IV per encryption. Without it, two merchants with the same token
       — or the same merchant before and after a no-op save — would produce
       identical rows, which leaks that they are the same. */
    assert.notEqual(encryptCredential(TOKEN), encryptCredential(TOKEN));
  });

  it("refuses a tampered ciphertext rather than returning garbage", () => {
    /* GCM authenticates. A flipped byte has to fail, not decrypt to something
       that then gets sent to Meta as a token. */
    const stored = encryptCredential(TOKEN);
    assert.equal(decryptCredential(stored.slice(0, -4) + "dead"), null);
  });

  it("refuses a tampered auth tag", () => {
    const [iv, , data] = encryptCredential(TOKEN).split(":");
    assert.equal(decryptCredential(`${iv}:${"0".repeat(32)}:${data}`), null);
  });

  it("returns null for anything that is not a stored credential", () => {
    /* Callers treat null as "this merchant is not connected". A throw here
       would take down every send in the queue after a key rotation. */
    for (const bad of [null, "", "not-encrypted", "a:b", "a:b:c:d"]) {
      assert.equal(decryptCredential(bad as string), null);
    }
  });

  it("handles a token with awkward characters", () => {
    const weird = "tok:en:with:colons and spaces ünïcode 🔑";
    assert.equal(decryptCredential(encryptCredential(weird)), weird);
  });
});
