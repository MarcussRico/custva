export const AUTO_TAGS = ["New", "Repeat", "High-value", "Inactive"] as const;
export type AutoTag = (typeof AUTO_TAGS)[number];

export const HIGH_VALUE_THRESHOLD = 2000;
export const INACTIVE_DAYS = 30;
export const NEW_CUSTOMER_DAYS = 7;

/** SQL fragment computing auto_tags array for a customer row alias `c`. */
export function autoTagsSql(alias = "c") {
  return `ARRAY_REMOVE(ARRAY[
    CASE WHEN ${alias}.total_visits = 1 AND ${alias}.created_at >= NOW() - INTERVAL '${NEW_CUSTOMER_DAYS} days' THEN 'New' END,
    CASE WHEN ${alias}.total_visits >= 2 THEN 'Repeat' END,
    CASE WHEN ${alias}.total_spend >= ${HIGH_VALUE_THRESHOLD} THEN 'High-value' END,
    CASE WHEN ${alias}.last_visit IS NOT NULL AND ${alias}.last_visit < NOW() - INTERVAL '${INACTIVE_DAYS} days' THEN 'Inactive' END
  ], NULL)`;
}

export function autoTagFilterSql(alias: string, tag: string) {
  switch (tag) {
    case "New":
      return `(${alias}.total_visits = 1 AND ${alias}.created_at >= NOW() - INTERVAL '${NEW_CUSTOMER_DAYS} days')`;
    case "Repeat":
      return `${alias}.total_visits >= 2`;
    case "High-value":
      return `${alias}.total_spend >= ${HIGH_VALUE_THRESHOLD}`;
    case "Inactive":
      return `${alias}.last_visit IS NOT NULL AND ${alias}.last_visit < NOW() - INTERVAL '${INACTIVE_DAYS} days'`;
    default:
      return "TRUE";
  }
}
