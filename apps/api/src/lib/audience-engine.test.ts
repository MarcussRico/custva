import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAudienceQuery } from "./audience-engine.js";

/* These exist because `buildAudienceQuery` leaked customers across merchants.
   The bug was structural, not a typo: the manual-include branch was ORed
   against a condition string that *contained* the tenancy and consent checks,
   so `(merchant AND opt_in AND rules) OR id = ANY(ids)` let any id in the
   list bypass all three.

   The assertions below are therefore about *where* the scope sits, not about
   the exact SQL text. Extract the parenthesised group holding the OR and prove
   the scope is not inside it — that is precisely the regression. */

const MERCHANT = "11111111-1111-1111-1111-111111111111";
const FOREIGN = "22222222-2222-2222-2222-222222222222";

/** The `( ... OR c.id = ANY(...) )` group, balanced-paren matched. */
function orGroup(sql: string): string {
  const anchor = sql.indexOf("OR c.id = ANY");
  assert.ok(anchor > -1, "expected an OR branch for manual includes");
  let depth = 0;
  for (let i = anchor; i >= 0; i--) {
    if (sql[i] === ")") depth++;
    else if (sql[i] === "(") {
      if (depth === 0) {
        // opening paren of the group containing the OR
        let d = 0;
        for (let j = i; j < sql.length; j++) {
          if (sql[j] === "(") d++;
          else if (sql[j] === ")") {
            d--;
            if (d === 0) return sql.slice(i, j + 1);
          }
        }
      }
      depth--;
    }
  }
  throw new Error("could not isolate the OR group");
}

describe("buildAudienceQuery", () => {
  it("scopes to the merchant even when manual includes are supplied", () => {
    const { sql } = buildAudienceQuery(MERCHANT, {}, [FOREIGN]);
    assert.match(sql, /c\.merchant_id = \$1/, "merchant scope must be present");
    assert.doesNotMatch(
      orGroup(sql),
      /merchant_id/,
      "merchant scope must sit OUTSIDE the OR, or a foreign id escapes it",
    );
  });

  it("respects opt-out even when manual includes are supplied", () => {
    const { sql } = buildAudienceQuery(MERCHANT, {}, [FOREIGN]);
    assert.match(sql, /c\.whatsapp_opt_in = TRUE/);
    assert.doesNotMatch(
      orGroup(sql),
      /whatsapp_opt_in/,
      "consent must sit OUTSIDE the OR, or a manual include messages someone who opted out",
    );
  });

  it("keeps the merchant id as the first parameter", () => {
    const { params } = buildAudienceQuery(MERCHANT, { minSpend: 500 }, [FOREIGN]);
    assert.equal(params[0], MERCHANT);
  });

  it("applies exclusions outside the OR, so an exclusion outranks an include", () => {
    const { sql } = buildAudienceQuery(MERCHANT, {}, [FOREIGN], [FOREIGN]);
    assert.match(sql, /c\.id != ALL/);
    assert.doesNotMatch(
      orGroup(sql),
      /!= ALL/,
      "an explicitly excluded customer must not be reachable via manual include",
    );
  });

  it("still scopes when there are no manual includes", () => {
    const { sql } = buildAudienceQuery(MERCHANT, { minSpend: 500 });
    assert.match(sql, /c\.merchant_id = \$1/);
    assert.match(sql, /c\.whatsapp_opt_in = TRUE/);
    assert.doesNotMatch(sql, /OR c\.id = ANY/);
  });

  it("numbers parameters consistently with the placeholders it emits", () => {
    const { sql, params } = buildAudienceQuery(
      MERCHANT,
      { minSpend: 100, maxSpend: 900, pincode: "560001" },
      [FOREIGN],
      [FOREIGN],
    );
    const highest = Math.max(
      ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])),
    );
    assert.equal(
      highest,
      params.length,
      "every placeholder must have a parameter and vice versa",
    );
  });
});
