import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMetaTemplateComponents,
  toMetaBody,
  toMetaTemplateName,
  validateTemplateForMeta,
} from "./meta-templates.js";

describe("toMetaTemplateName", () => {
  it("converts a merchant-facing name to Meta's format", () => {
    /* The exact failure that made every send impossible: this name was being
       sent to Meta verbatim. */
    assert.equal(toMetaTemplateName("Brownie Day 3"), "brownie_day_3");
  });

  it("strips punctuation and collapses separators", () => {
    assert.equal(toMetaTemplateName("Welcome!! -- Back  Again"), "welcome_back_again");
  });

  it("trims leading and trailing underscores", () => {
    assert.equal(toMetaTemplateName("  spaced  "), "spaced");
  });

  it("is deterministic — the same input always maps to the same name", () => {
    /* Non-determinism would create a duplicate at Meta on every resubmission
       instead of updating the existing template. */
    assert.equal(toMetaTemplateName("Day 7 Nudge"), toMetaTemplateName("Day 7 Nudge"));
  });

  it("still produces something submittable when the name is all symbols", () => {
    assert.equal(toMetaTemplateName("☕☕☕"), "custva_template");
  });

  it("respects the 512 character limit", () => {
    assert.ok(toMetaTemplateName("a".repeat(700)).length <= 512);
  });

  it("only ever emits characters Meta accepts", () => {
    for (const input of ["Brownie Day 3", "café ☕ offer!", "A/B test #2"]) {
      assert.match(toMetaTemplateName(input), /^[a-z0-9_]+$/);
    }
  });
});

describe("toMetaBody", () => {
  it("converts named placeholders to positional ones", () => {
    const r = toMetaBody("Hi {{name}}, welcome to {{shop_name}}!");
    assert.equal(r.metaBody, "Hi {{1}}, welcome to {{2}}!");
    assert.deepEqual(r.variableOrder, ["name", "shop_name"]);
  });

  it("orders by first appearance, matching how the worker sends parameters", () => {
    const r = toMetaBody("{{shop_name}} misses you, {{name}}");
    assert.deepEqual(r.variableOrder, ["shop_name", "name"]);
    assert.equal(r.metaBody, "{{1}} misses you, {{2}}");
  });

  it("reuses the same index for a repeated placeholder", () => {
    const r = toMetaBody("Hi {{name}}, see you soon {{name}}");
    assert.equal(r.metaBody, "Hi {{1}}, see you soon {{1}}");
    assert.deepEqual(r.variableOrder, ["name"]);
  });

  it("leaves an already-positional body untouched", () => {
    const r = toMetaBody("Hi {{1}}, welcome to {{2}}");
    assert.equal(r.metaBody, "Hi {{1}}, welcome to {{2}}");
    assert.deepEqual(r.variableOrder, []);
  });

  it("tolerates whitespace inside the braces", () => {
    assert.equal(toMetaBody("Hi {{ name }}!").metaBody, "Hi {{1}}!");
  });

  it("handles a body with no variables", () => {
    const r = toMetaBody("Thanks for visiting.");
    assert.equal(r.metaBody, "Thanks for visiting.");
    assert.deepEqual(r.variableOrder, []);
  });
});

describe("validateTemplateForMeta", () => {
  const ok = { name: "Day 3", body: "Hi {{name}}, come back to {{shop_name}} soon." };

  it("passes a well-formed template", () => {
    assert.deepEqual(validateTemplateForMeta(ok), []);
  });

  it("rejects a body starting with a variable", () => {
    const p = validateTemplateForMeta({ ...ok, body: "{{name}}, we miss you." });
    assert.ok(p.some((x) => x.field === "body" && /cannot start/.test(x.issue)));
  });

  it("rejects a body ending with a variable", () => {
    const p = validateTemplateForMeta({ ...ok, body: "We miss you at {{shop_name}}" });
    assert.ok(p.some((x) => /cannot end/.test(x.issue)));
  });

  it("rejects two adjacent variables", () => {
    const p = validateTemplateForMeta({ ...ok, body: "Hi {{name}} {{shop_name}} welcome" });
    assert.ok(p.some((x) => /next to each other/.test(x.issue)));
  });

  it("rejects variables in a footer", () => {
    const p = validateTemplateForMeta({ ...ok, footerText: "From {{shop_name}}" });
    assert.ok(p.some((x) => x.field === "footer"));
  });

  it("rejects an over-long header", () => {
    const p = validateTemplateForMeta({ ...ok, headerText: "x".repeat(61) });
    assert.ok(p.some((x) => x.field === "header"));
  });

  it("rejects an empty body", () => {
    assert.ok(validateTemplateForMeta({ ...ok, body: "  " }).length > 0);
  });

  it("flags the seeded day_14 first-visit template, which starts with a variable", () => {
    /* Real shipped copy: "Hi {{name}}, it has been two weeks!" is fine, but
       a header of "{{shop_name}} misses you" would not be. This is exactly the
       class of problem worth catching before a review cycle. */
    const p = validateTemplateForMeta({
      name: "First Visit Day 14",
      body: "{{shop_name}} misses you. Drop by for a loyalty surprise.",
    });
    assert.ok(p.length > 0);
  });
});

describe("buildMetaTemplateComponents", () => {
  it("emits BODY with positional text and sample values", () => {
    const c = buildMetaTemplateComponents({
      body: "Hi {{name}}, welcome to {{shop_name}}!",
    });
    const body = c.find((x) => x.type === "BODY");
    assert.equal(body?.text, "Hi {{1}}, welcome to {{2}}!");
    /* Meta rejects variables without examples — a reviewer must be able to
       read the finished message. */
    assert.deepEqual(body?.example, { body_text: [["Priya", "Filter Room"]] });
  });

  it("omits the example when there are no variables", () => {
    const c = buildMetaTemplateComponents({ body: "Thanks for visiting." });
    assert.equal(c.find((x) => x.type === "BODY")?.example, undefined);
  });

  it("emits an IMAGE header from a handle", () => {
    const c = buildMetaTemplateComponents({
      body: "Hi {{name}}, fresh out of the oven.",
      headerImageHandle: "4::aW1hZ2U=",
    });
    const header = c.find((x) => x.type === "HEADER");
    assert.equal(header?.format, "IMAGE");
    assert.deepEqual(header?.example, { header_handle: ["4::aW1hZ2U="] });
  });

  it("prefers an image header over a text header when both are given", () => {
    const c = buildMetaTemplateComponents({
      body: "Hi {{name}}, come by.",
      headerText: "Ignored",
      headerImageHandle: "handle",
    });
    assert.equal(c.filter((x) => x.type === "HEADER").length, 1);
    assert.equal(c.find((x) => x.type === "HEADER")?.format, "IMAGE");
  });

  it("maps url buttons to Meta's shape", () => {
    const c = buildMetaTemplateComponents({
      body: "Hi {{name}}, come by.",
      buttons: [{ type: "url", text: "Visit us", value: "https://filterroom.in" }],
    });
    const buttons = c.find((x) => x.type === "BUTTONS");
    assert.deepEqual(buttons?.buttons, [
      { type: "URL", text: "Visit us", url: "https://filterroom.in" },
    ]);
  });

  it("orders components HEADER, BODY, FOOTER, BUTTONS", () => {
    const c = buildMetaTemplateComponents({
      body: "Hi {{name}}, come by.",
      headerText: "Hello",
      footerText: "See you soon",
      buttons: [{ type: "url", text: "Visit", value: "https://x.com" }],
    });
    assert.deepEqual(c.map((x) => x.type), ["HEADER", "BODY", "FOOTER", "BUTTONS"]);
  });
});
