import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAudienceQuery,
  buildCustomerListQuery,
  consentScopeSql,
  customerListFilterSchema,
} from "./audience-engine.js";

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
    assert.match(sql, /consent_state/);
    assert.doesNotMatch(
      orGroup(sql),
      /consent_state|whatsapp_opt_in/,
      "consent must sit OUTSIDE the OR, or a manual include messages someone who opted out",
    );
  });

  it("never messages a customer who asked to stop", () => {
    /* The one rule with no exceptions. Whether `unknown` may be messaged is
       policy and may change; `withdrawn` may not, so this asserts the exclusion
       survives whichever way the policy constant is set. */
    const { sql } = buildAudienceQuery(MERCHANT, {}, [FOREIGN], []);
    const scope = consentScopeSql("c");
    assert.ok(
      /consent_state <> 'withdrawn'/.test(scope) || /consent_state = 'granted'/.test(scope),
      `consent scope must exclude withdrawn, got: ${scope}`,
    );
    assert.ok(sql.includes(scope), "the audience query must carry the consent scope verbatim");
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
    assert.match(sql, /consent_state/);
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

describe("buildAudienceQuery — behavioural targeting", () => {
  /* The campaign builder sent none of this until 2026-09-13: the schema had
     accepted `segments` and `overdueOnly` since Phase C, but the UI only ever
     sent the legacy global filters, so every campaign targeted the thresholds
     the segments exist to replace. These pin the SQL the builder now depends
     on. */

  it("targets by behavioural segment", () => {
    const { sql, params } = buildAudienceQuery(MERCHANT, {
      segments: ["at_risk", "dormant"],
    });
    assert.match(sql, /c\.segment = ANY/);
    assert.deepEqual(params[params.length - 1], ["at_risk", "dormant"]);
  });

  it("targets customers past their own expected revisit", () => {
    const { sql } = buildAudienceQuery(MERCHANT, { overdueOnly: true });
    assert.match(sql, /expected_revisit_at <= NOW\(\)/);
  });

  it("combines a segment with overdue rather than replacing it", () => {
    const { sql } = buildAudienceQuery(MERCHANT, {
      segments: ["at_risk"],
      overdueOnly: true,
    });
    assert.match(sql, /c\.segment = ANY/);
    assert.match(sql, /expected_revisit_at <= NOW\(\)/);
  });

  it("keeps segment targeting inside the OR, not in scope", () => {
    /* Segments are a *rule*, so an explicitly included customer is allowed to
       bypass them — that is what manual include means. Tenancy and consent are
       not, and the earlier tests prove those stay outside. */
    const { sql } = buildAudienceQuery(MERCHANT, { segments: ["at_risk"] }, [FOREIGN]);
    assert.match(orGroup(sql), /c\.segment = ANY/);
  });

  it("still excludes a withdrawn customer when targeting a segment", () => {
    const { sql } = buildAudienceQuery(MERCHANT, { segments: ["at_risk"] }, [FOREIGN]);
    assert.ok(sql.includes(consentScopeSql("c")));
    assert.doesNotMatch(orGroup(sql), /consent_state/);
  });
});

describe("buildCustomerListQuery — behavioural filters", () => {
  const base = { sortBy: "updatedAt" as const, page: 1, limit: 20 };

  it("filters by segment", () => {
    /* The schema accepted `segments` from Phase C onward while the SQL ignored
       it, so the list came back unfiltered and looked correct. */
    const { itemsSql: sql } = buildCustomerListQuery(MERCHANT, {
      ...base,
      segments: ["at_risk", "dormant"],
    });
    assert.match(sql, /c\.segment = ANY/);
  });

  it("filters to customers past their expected revisit", () => {
    const { itemsSql: sql } = buildCustomerListQuery(MERCHANT, { ...base, overdueOnly: true });
    assert.match(sql, /expected_revisit_at <= NOW\(\)/);
  });

  it("omits both when not asked for", () => {
    const { itemsSql: sql } = buildCustomerListQuery(MERCHANT, base);
    assert.doesNotMatch(sql, /c\.segment = ANY/);
    assert.doesNotMatch(sql, /expected_revisit_at <= NOW\(\)/);
  });

  it("returns the segment fields the UI needs", () => {
    const { itemsSql } = buildCustomerListQuery(MERCHANT, base);
    assert.match(itemsSql, /c\.segment/);
    assert.match(itemsSql, /expectedRevisitAt/);
  });

  it("stays merchant-scoped with the filters applied", () => {
    const { itemsSql: sql, params } = buildCustomerListQuery(MERCHANT, {
      ...base,
      segments: ["loyal"],
      overdueOnly: true,
    });
    assert.match(sql, /c\.merchant_id = \$1/);
    assert.equal(params[0], MERCHANT);
  });
});

describe("customerListFilterSchema — query string coercion", () => {
  it("accepts a single segment as a scalar", () => {
    /* A query string gives `segments=at_risk`, not an array. Without coercion
       the API rejected the filter the UI actually sends. */
    const parsed = customerListFilterSchema.parse({ segments: "at_risk" });
    assert.deepEqual(parsed.segments, ["at_risk"]);
  });

  it("accepts several segments comma-separated", () => {
    const parsed = customerListFilterSchema.parse({ segments: "at_risk,dormant" });
    assert.deepEqual(parsed.segments, ["at_risk", "dormant"]);
  });

  it("still accepts a real array", () => {
    const parsed = customerListFilterSchema.parse({ segments: ["loyal"] });
    assert.deepEqual(parsed.segments, ["loyal"]);
  });

  it("rejects a segment that is not one of the four", () => {
    assert.throws(() => customerListFilterSchema.parse({ segments: "vip" }));
  });
});
