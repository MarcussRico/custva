import { z } from "zod";
import { autoTagFilterSql, autoTagsSql } from "./customer-tags.js";

export const audienceRulesSchema = z.object({
  inactiveDaysGte: z.number().int().nonnegative().optional(),
  minSpend: z.number().nonnegative().optional(),
  maxSpend: z.number().nonnegative().optional(),
  pincode: z.string().length(6).optional(),
  tags: z.array(z.enum(["New", "Repeat", "High-value", "Inactive"])).optional(),
  /* FR-I1 — the targeting that matters. The legacy `tags` above are computed
     from global constants (spend > 2000, inactive > 30 days); these are the
     four behavioural segments from each customer's own rhythm. */
  segments: z
    .array(z.enum(["first_time", "loyal", "at_risk", "dormant"]))
    .optional(),
  /* "Overdue right now" — past their own expected revisit date, whatever that
     is for them. This is the missed-rhythm audience. */
  overdueOnly: z.boolean().optional(),
  minAge: z.number().int().nonnegative().optional(),
  maxAge: z.number().int().nonnegative().optional(),
  birthdayMonth: z.number().int().min(1).max(12).optional(),
  lastVisitBefore: z.string().datetime().optional(),
  lastVisitAfter: z.string().datetime().optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  campaignEngagement: z.enum(["delivered", "read", "none"]).optional()
});

export type AudienceRules = z.infer<typeof audienceRulesSchema>;

export interface AudienceQueryResult {
  sql: string;
  params: unknown[];
}

export function buildAudienceQuery(
  merchantId: string,
  rules: AudienceRules,
  manualIncludeIds: string[] = [],
  manualExcludeIds: string[] = []
): AudienceQueryResult {
  /* `scope` is non-negotiable and always ANDed: tenancy and consent. `conditions`
     holds the audience rules, which a manual include is allowed to bypass.
     Keeping these apart is the whole point — when they were one list, the
     `OR c.id = ANY(...)` branch escaped merchant scoping and opt-in together,
     so a caller could message another merchant's customers and people who had
     opted out. */
  const scope: string[] = ["c.merchant_id = $1", "c.whatsapp_opt_in = TRUE"];
  const conditions: string[] = [];
  const params: unknown[] = [merchantId];
  let idx = 2;

  if (rules.inactiveDaysGte != null) {
    conditions.push(`c.last_visit <= NOW() - ($${idx}::int * INTERVAL '1 day')`);
    params.push(rules.inactiveDaysGte);
    idx++;
  }
  if (rules.minSpend != null) {
    conditions.push(`c.total_spend >= $${idx}`);
    params.push(rules.minSpend);
    idx++;
  }
  if (rules.maxSpend != null) {
    conditions.push(`c.total_spend <= $${idx}`);
    params.push(rules.maxSpend);
    idx++;
  }
  if (rules.pincode) {
    conditions.push(`c.pincode = $${idx}`);
    params.push(rules.pincode);
    idx++;
  }
  if (rules.minAge != null) {
    conditions.push(`c.age >= $${idx}`);
    params.push(rules.minAge);
    idx++;
  }
  if (rules.maxAge != null) {
    conditions.push(`c.age <= $${idx}`);
    params.push(rules.maxAge);
    idx++;
  }
  if (rules.lastVisitBefore) {
    conditions.push(`c.last_visit <= $${idx}`);
    params.push(rules.lastVisitBefore);
    idx++;
  }
  if (rules.lastVisitAfter) {
    conditions.push(`c.last_visit >= $${idx}`);
    params.push(rules.lastVisitAfter);
    idx++;
  }
  if (rules.createdFrom) {
    conditions.push(`c.created_at >= $${idx}`);
    params.push(rules.createdFrom);
    idx++;
  }
  if (rules.createdTo) {
    conditions.push(`c.created_at <= $${idx}`);
    params.push(rules.createdTo);
    idx++;
  }
  if (rules.tags?.length) {
    const tagConds = rules.tags.map((t) => autoTagFilterSql("c", t));
    conditions.push(`(${tagConds.join(" OR ")})`);
  }
  if (rules.birthdayMonth != null) {
    conditions.push(`EXTRACT(MONTH FROM c.created_at) = $${idx}`);
    params.push(rules.birthdayMonth);
    idx++;
  }
  if (rules.campaignEngagement === "delivered") {
    conditions.push(
      `EXISTS (SELECT 1 FROM messages m WHERE m.customer_id = c.id AND m.merchant_id = c.merchant_id AND m.status IN ('delivered','read'))`
    );
  } else if (rules.campaignEngagement === "read") {
    conditions.push(
      `EXISTS (SELECT 1 FROM messages m WHERE m.customer_id = c.id AND m.merchant_id = c.merchant_id AND m.status = 'read')`
    );
  } else if (rules.campaignEngagement === "none") {
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM messages m WHERE m.customer_id = c.id AND m.merchant_id = c.merchant_id)`
    );
  }

  /* An explicit exclusion outranks an explicit include, so this is scope too. */
  if (rules.segments?.length) {
    conditions.push(`c.segment = ANY($${idx}::text[])`);
    params.push(rules.segments);
    idx++;
  }
  if (rules.overdueOnly) {
    conditions.push(`c.expected_revisit_at IS NOT NULL AND c.expected_revisit_at <= NOW()`);
  }

  if (manualExcludeIds.length) {
    scope.push(`c.id != ALL($${idx}::uuid[])`);
    params.push(manualExcludeIds);
    idx++;
  }

  /* No rules means "everyone in scope" — preserved from the original behaviour
     deliberately, so this fix does not silently change who existing campaigns
     target. Whether that default is *wise* is a separate question. */
  const ruleMatch = conditions.length ? conditions.join(" AND ") : "TRUE";

  if (manualIncludeIds.length) {
    const sql = `
      SELECT DISTINCT c.id, c.mobile, c.name, c.segment
      FROM customers c
      WHERE ${scope.join(" AND ")}
        AND (
          (${ruleMatch})
          OR c.id = ANY($${idx}::uuid[])
        )
      ORDER BY c.name ASC`;
    params.push(manualIncludeIds);
    return { sql, params };
  }

  const sql = `
    SELECT c.id, c.mobile, c.name, c.segment
    FROM customers c
    WHERE ${scope.join(" AND ")}
      AND ${ruleMatch}
    ORDER BY c.name ASC`;

  return { sql, params };
}

export const customerListFilterSchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(100).default(20),
  q: z.string().optional(),
  pincode: z.string().optional(),
  minSpend: z.coerce.number().optional(),
  maxSpend: z.coerce.number().optional(),
  minVisits: z.coerce.number().optional(),
  maxVisits: z.coerce.number().optional(),
  inactiveDays: z.coerce.number().optional(),
  inactiveDaysExact: z.coerce.number().optional(),
  exactVisits: z.coerce.number().optional(),
  minAge: z.coerce.number().optional(),
  maxAge: z.coerce.number().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  lastVisitFrom: z.string().optional(),
  lastVisitTo: z.string().optional(),
  tag: z.enum(["New", "Repeat", "High-value", "Inactive"]).optional(),
  birthdayMonth: z.coerce.number().optional(),
  campaignEngagement: z.enum(["delivered", "read", "none"]).optional(),
  /* Arrives as a query string, so a single value is a scalar and several are
     comma-separated. Coerce before validating rather than making every caller
     construct `segments[]=` repeats. */
  segments: z
    .preprocess(
      (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
      z.array(z.enum(["first_time", "loyal", "at_risk", "dormant"]))
    )
    .optional(),
  overdueOnly: z.coerce.boolean().optional(),
  sortBy: z.enum(["name", "totalSpend", "totalVisits", "lastVisit", "createdAt", "updatedAt"]).default("updatedAt"),
  cursor: z.string().optional()
});

export function buildCustomerListQuery(
  merchantId: string,
  filters: z.infer<typeof customerListFilterSchema>
) {
  const conditions: string[] = ["c.merchant_id = $1"];
  const params: unknown[] = [merchantId];
  let idx = 2;

  if (filters.q) {
    conditions.push(`(LOWER(c.name) LIKE $${idx} OR c.mobile LIKE $${idx})`);
    params.push(`%${filters.q.toLowerCase()}%`);
    idx++;
  }
  if (filters.pincode) {
    conditions.push(`c.pincode = $${idx}`);
    params.push(filters.pincode);
    idx++;
  }
  if (filters.minSpend != null) {
    conditions.push(`c.total_spend >= $${idx}`);
    params.push(filters.minSpend);
    idx++;
  }
  if (filters.maxSpend != null) {
    conditions.push(`c.total_spend <= $${idx}`);
    params.push(filters.maxSpend);
    idx++;
  }
  if (filters.minVisits != null) {
    conditions.push(`c.total_visits >= $${idx}`);
    params.push(filters.minVisits);
    idx++;
  }
  if (filters.maxVisits != null) {
    conditions.push(`c.total_visits <= $${idx}`);
    params.push(filters.maxVisits);
    idx++;
  }
  if (filters.inactiveDays != null) {
    conditions.push(`c.last_visit <= NOW() - ($${idx}::int * INTERVAL '1 day')`);
    params.push(filters.inactiveDays);
    idx++;
  }
  if (filters.inactiveDaysExact != null) {
    conditions.push(`c.last_visit::date = CURRENT_DATE - ($${idx}::int * INTERVAL '1 day')`);
    params.push(filters.inactiveDaysExact);
    idx++;
  }
  if (filters.exactVisits != null) {
    conditions.push(`c.total_visits = $${idx}`);
    params.push(filters.exactVisits);
    idx++;
  }
  if (filters.minAge != null) {
    conditions.push(`c.age >= $${idx}`);
    params.push(filters.minAge);
    idx++;
  }
  if (filters.maxAge != null) {
    conditions.push(`c.age <= $${idx}`);
    params.push(filters.maxAge);
    idx++;
  }
  if (filters.createdFrom) {
    conditions.push(`c.created_at >= $${idx}`);
    params.push(filters.createdFrom);
    idx++;
  }
  if (filters.createdTo) {
    conditions.push(`c.created_at <= $${idx}`);
    params.push(filters.createdTo);
    idx++;
  }
  if (filters.lastVisitFrom) {
    conditions.push(`c.last_visit >= $${idx}`);
    params.push(filters.lastVisitFrom);
    idx++;
  }
  if (filters.lastVisitTo) {
    conditions.push(`c.last_visit <= $${idx}`);
    params.push(filters.lastVisitTo);
    idx++;
  }
  if (filters.tag) {
    conditions.push(autoTagFilterSql("c", filters.tag));
  }
  /* The behavioural segments. These were added to the schema in Phase C but
     the SQL was never written, so the API accepted the filter and silently
     returned everyone — the worst kind of failure, because it looks like it
     worked. */
  if (filters.segments?.length) {
    conditions.push(`c.segment = ANY($${idx}::text[])`);
    params.push(filters.segments);
    idx++;
  }
  if (filters.overdueOnly) {
    conditions.push(
      `c.expected_revisit_at IS NOT NULL AND c.expected_revisit_at <= NOW()`
    );
  }
  if (filters.birthdayMonth != null) {
    conditions.push(`EXTRACT(MONTH FROM c.created_at) = $${idx}`);
    params.push(filters.birthdayMonth);
    idx++;
  }
  if (filters.campaignEngagement === "delivered") {
    conditions.push(
      `EXISTS (SELECT 1 FROM messages m WHERE m.customer_id = c.id AND m.merchant_id = c.merchant_id AND m.status IN ('delivered','read'))`
    );
  } else if (filters.campaignEngagement === "read") {
    conditions.push(
      `EXISTS (SELECT 1 FROM messages m WHERE m.customer_id = c.id AND m.merchant_id = c.merchant_id AND m.status = 'read')`
    );
  } else if (filters.campaignEngagement === "none") {
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM messages m WHERE m.customer_id = c.id AND m.merchant_id = c.merchant_id)`
    );
  }

  const sortMap: Record<string, string> = {
    name: "c.name ASC",
    totalSpend: "c.total_spend DESC",
    totalVisits: "c.total_visits DESC",
    lastVisit: "c.last_visit DESC NULLS LAST",
    createdAt: "c.created_at DESC",
    updatedAt: "c.updated_at DESC"
  };
  const orderBy = sortMap[filters.sortBy] ?? sortMap.updatedAt;

  const where = conditions.join(" AND ");
  const offset = (filters.page - 1) * filters.limit;

  return {
    itemsSql: `
      SELECT c.id, c.merchant_id AS "merchantId", c.name, c.mobile, c.pincode, c.age,
             c.location, c.notes, c.total_spend AS "totalSpend", c.total_visits AS "totalVisits",
             c.last_visit AS "lastVisit", c.created_at AS "createdAt", c.updated_at AS "updatedAt",
             c.segment, c.expected_gap_days AS "expectedGapDays",
             c.expected_revisit_at AS "expectedRevisitAt",
             ${autoTagsSql("c")} AS "autoTags"
      FROM customers c
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT $${idx} OFFSET $${idx + 1}`,
    countSql: `SELECT COUNT(*)::text AS count FROM customers c WHERE ${where}`,
    params: [...params, filters.limit, offset],
    countParams: params
  };
}
