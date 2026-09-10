import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEADER_IMAGE,
  inspectImage,
  isBlocked,
  validateHeaderImage,
} from "./media.js";

/** Minimal valid PNG header: signature + IHDR with the given dimensions. */
function png(width: number, height: number, pad = 0): Uint8Array {
  const b = new Uint8Array(24 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(b.buffer);
  view.setUint32(8, 13); // IHDR length
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return b;
}

/** JPEG with a leading APP0 segment before the SOF0, as real encoders emit. */
function jpeg(width: number, height: number): Uint8Array {
  const app0Len = 16;
  const b = new Uint8Array(2 + 2 + app0Len + 2 + 9);
  const view = new DataView(b.buffer);
  let o = 0;
  b[o++] = 0xff; b[o++] = 0xd8;          // SOI
  b[o++] = 0xff; b[o++] = 0xe0;          // APP0
  view.setUint16(o, app0Len); o += app0Len;
  b[o++] = 0xff; b[o++] = 0xc0;          // SOF0
  view.setUint16(o, 11); o += 2;         // segment length
  b[o++] = 8;                            // precision
  view.setUint16(o, height); o += 2;
  view.setUint16(o, width);
  return b;
}

describe("inspectImage", () => {
  it("reads PNG dimensions from IHDR", () => {
    assert.deepEqual(inspectImage(png(1200, 628)), {
      mimeType: "image/png",
      width: 1200,
      height: 628,
      bytes: 24,
    });
  });

  it("reads JPEG dimensions by walking to the SOF marker", () => {
    /* There is no fixed offset — the preceding segments vary by encoder, which
       is why this walks rather than indexes. */
    const info = inspectImage(jpeg(1200, 628));
    assert.equal(info?.mimeType, "image/jpeg");
    assert.equal(info?.width, 1200);
    assert.equal(info?.height, 628);
  });

  it("identifies from the bytes, not a claimed content type", () => {
    /* A client can label anything image/png; Meta will not be fooled and
       neither is this. */
    const notAnImage = new TextEncoder().encode("%PDF-1.7 this is not an image");
    assert.equal(inspectImage(notAnImage), null);
  });

  it("returns null for a truncated PNG", () => {
    assert.equal(inspectImage(png(1200, 628).slice(0, 20)), null);
  });
});

describe("validateHeaderImage", () => {
  it("accepts a well-sized 1.91:1 image", () => {
    const { info, problems } = validateHeaderImage(png(1200, 628));
    assert.equal(info?.width, 1200);
    assert.deepEqual(problems, []);
  });

  it("blocks an empty body", () => {
    const { problems } = validateHeaderImage(new Uint8Array(0));
    assert.equal(problems[0].code, "empty");
    assert.equal(isBlocked(problems), true);
  });

  it("blocks a file that is not a JPEG or PNG", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
    const { problems } = validateHeaderImage(gif);
    assert.equal(problems[0].code, "corrupt");
    assert.equal(isBlocked(problems), true);
  });

  it("blocks anything over 5 MB", () => {
    const big = png(1200, 628, HEADER_IMAGE.maxBytes);
    const { problems } = validateHeaderImage(big);
    assert.ok(problems.some((p) => p.code === "too_large" && p.blocking));
  });

  it("blocks an image too small to look sharp", () => {
    const { problems } = validateHeaderImage(png(200, 105));
    assert.ok(problems.some((p) => p.code === "too_small" && p.blocking));
  });

  it("warns about aspect ratio without blocking it", () => {
    /* WhatsApp crops rather than refuses, and a merchant may prefer their own
       framing — so tell them it will be cropped, do not stop them. */
    const { problems } = validateHeaderImage(png(1000, 1000));
    const aspect = problems.find((p) => p.code === "bad_aspect");
    assert.ok(aspect);
    assert.equal(aspect?.blocking, false);
    assert.equal(isBlocked(problems), false);
    assert.match(aspect!.message, /cropped/);
  });

  it("accepts the crop the message previews already use", () => {
    /* 4:3, which is what msg-brownie.jpg and msg-coffee.jpg are cropped to. */
    const { problems } = validateHeaderImage(png(736, 552));
    assert.equal(isBlocked(problems), false);
  });

  it("explains problems in a merchant's language, not a developer's", () => {
    const { problems } = validateHeaderImage(new Uint8Array([1, 2, 3, 4]));
    assert.doesNotMatch(problems[0].message, /null|undefined|0x|buffer/i);
    assert.match(problems[0].message, /JPEG or PNG/);
  });
});
