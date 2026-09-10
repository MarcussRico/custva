import { Router } from "express";
import { sendSuccess } from "../../lib/api-response.js";
import { query } from "../../lib/db.js";
import { INACTIVE_DAYS, HIGH_VALUE_THRESHOLD } from "../../lib/customer-tags.js";

export const analyticsRouter: Router = Router();

analyticsRouter.get("/dashboard", async (req, res) => {
  const merchantId = req.auth!.merchantId;

  const customers = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM customers WHERE merchant_id = $1",
    [merchantId]
  );
  const repeat = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM customers WHERE merchant_id = $1 AND total_visits >= 2",
    [merchantId]
  );
  const inactive = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customers
     WHERE merchant_id = $1 AND last_visit < NOW() - INTERVAL '${INACTIVE_DAYS} days'`,
    [merchantId]
  );
  const revenue = await query<{ total: string }>(
    "SELECT COALESCE(SUM(total_spend), 0)::text AS total FROM customers WHERE merchant_id = $1",
    [merchantId]
  );

  const todayVisitsRow = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customer_visits
     WHERE merchant_id = $1 AND visit_at::date = CURRENT_DATE`,
    [merchantId]
  );
  const todayRevenueRow = await query<{ total: string }>(
    `SELECT COALESCE(SUM(billing_amount), 0)::text AS total FROM customer_visits
     WHERE merchant_id = $1 AND visit_at::date = CURRENT_DATE`,
    [merchantId]
  );
  const todayRetentionRevenueRow = await query<{ total: string }>(
    `SELECT COALESCE(SUM(billing_amount), 0)::text AS total FROM customer_visits
     WHERE merchant_id = $1 AND visit_at::date = CURRENT_DATE AND is_repeat_visit = TRUE`,
    [merchantId]
  );

  /* FR-M1/M2 — the split that makes the commission claim honest.
     `todayRepeatRevenue` above is ALL repeat revenue: it includes regulars who
     were coming back regardless. Only `influenced` may be described as revenue
     Custva brought in (SRS §16). */
  const splitRow = await query<{
    organic: string;
    influenced: string;
    influenced_visits: string;
  }>(
    `SELECT
       COALESCE(SUM(billing_amount) FILTER
         (WHERE return_type = 'organic' AND is_repeat_visit = TRUE), 0)::text AS organic,
       COALESCE(SUM(billing_amount) FILTER
         (WHERE return_type = 'custva_influenced'), 0)::text AS influenced,
       COUNT(*) FILTER (WHERE return_type = 'custva_influenced')::text AS influenced_visits
     FROM customer_visits
     WHERE merchant_id = $1 AND visit_at >= CURRENT_DATE - INTERVAL '30 days'`,
    [merchantId]
  );

  const commissionRow = await query<{ pending: string; events: string }>(
    `SELECT COALESCE(SUM(commission_amount), 0)::text AS pending,
            COUNT(*)::text AS events
       FROM commission_events
      WHERE merchant_id = $1 AND status = 'pending'`,
    [merchantId]
  );

  const series = await query(
    `SELECT metric_date AS date, visits, revenue, new_customers AS "newCustomers",
            messages_sent AS "messagesSent", messages_delivered AS "messagesDelivered",
            organic_repeat_revenue AS "organicRepeatRevenue",
            influenced_revenue AS "custvaInfluencedRevenue",
            influenced_visits AS "influencedVisits"
     FROM daily_merchant_metrics
     WHERE merchant_id = $1 AND metric_date >= CURRENT_DATE - INTERVAL '30 days'
     ORDER BY metric_date ASC`,
    [merchantId]
  );

  const totalCustomers = Number(customers.rows[0].count);
  const repeatCustomers = Number(repeat.rows[0].count);
  const retentionRate =
    totalCustomers === 0 ? 0 : Number(((repeatCustomers / totalCustomers) * 100).toFixed(2));

  const prevMonth = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customers
     WHERE merchant_id = $1 AND created_at >= NOW() - INTERVAL '60 days'
       AND created_at < NOW() - INTERVAL '30 days'`,
    [merchantId]
  );
  const thisMonth = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customers
     WHERE merchant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
    [merchantId]
  );
  const prevCount = Number(prevMonth.rows[0].count);
  const thisCount = Number(thisMonth.rows[0].count);
  const customerGrowth =
    prevCount === 0 ? (thisCount > 0 ? 100 : 0) : Number((((thisCount - prevCount) / prevCount) * 100).toFixed(2));

  return sendSuccess(req, res, {
    totalCustomers,
    repeatCustomers,
    todayVisits: Number(todayVisitsRow.rows[0].count),
    todayRevenue: Number(todayRevenueRow.rows[0].total),
    /* Renamed from todayRetentionRevenue. It is the sum of every repeat visit
       and always was; calling it "retention revenue" on a dashboard implied
       Custva produced it. Kept as a secondary metric per SRS §16. */
    todayRepeatRevenue: Number(todayRetentionRevenueRow.rows[0].total),
    /* FR-M2 — organic and influenced shown separately, never summed into one
       headline number. */
    last30Days: {
      organicRepeatRevenue: Number(splitRow.rows[0].organic),
      custvaInfluencedRevenue: Number(splitRow.rows[0].influenced),
      influencedVisits: Number(splitRow.rows[0].influenced_visits)
    },
    commission: {
      pendingAmount: Number(commissionRow.rows[0].pending),
      pendingEvents: Number(commissionRow.rows[0].events)
    },
    retentionRate,
    customerGrowth,
    activeCustomers: totalCustomers - Number(inactive.rows[0].count),
    inactiveCustomers: Number(inactive.rows[0].count),
    totalRevenue: Number(revenue.rows[0].total),
    highValueThreshold: HIGH_VALUE_THRESHOLD,
    series: series.rows
  });
});

analyticsRouter.get("/customers", async (req, res) => {
  const merchantId = req.auth!.merchantId;

  const topCustomers = await query(
    `SELECT id, name, mobile, total_spend AS "totalSpend", total_visits AS "totalVisits"
     FROM customers WHERE merchant_id = $1
     ORDER BY total_spend DESC LIMIT 10`,
    [merchantId]
  );

  const buckets = await query(
    `SELECT
       COUNT(*) FILTER (WHERE last_visit >= NOW() - INTERVAL '7 days')::int AS "active7d",
       COUNT(*) FILTER (WHERE last_visit >= NOW() - INTERVAL '30 days' AND last_visit < NOW() - INTERVAL '7 days')::int AS "active30d",
       COUNT(*) FILTER (WHERE last_visit < NOW() - INTERVAL '30 days' OR last_visit IS NULL)::int AS "inactive"
     FROM customers WHERE merchant_id = $1`,
    [merchantId]
  );

  const newVsRepeat = await query(
    `SELECT
       COUNT(*) FILTER (WHERE total_visits = 1)::int AS "newCustomers",
       COUNT(*) FILTER (WHERE total_visits >= 2)::int AS "repeatCustomers"
     FROM customers WHERE merchant_id = $1`,
    [merchantId]
  );

  return sendSuccess(req, res, {
    topCustomers: topCustomers.rows,
    inactiveBuckets: buckets.rows[0],
    newVsRepeat: newVsRepeat.rows[0]
  });
});

analyticsRouter.get("/retention", async (req, res) => {
  const merchantId = req.auth!.merchantId;
  const range = String(req.query.range ?? "30d");
  const days = range === "90d" ? 90 : range === "7d" ? 7 : 30;

  const series = await query(
    `SELECT metric_date AS date,
            CASE WHEN visits > 0 THEN ROUND((messages_delivered::numeric / NULLIF(messages_sent, 0)) * 100, 2) ELSE 0 END AS "deliveryRate",
            new_customers AS "newCustomers",
            visits
     FROM daily_merchant_metrics
     WHERE merchant_id = $1 AND metric_date >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
     ORDER BY metric_date ASC`,
    [merchantId, days]
  );

  return sendSuccess(req, res, { range, series: series.rows });
});

analyticsRouter.get("/campaigns", async (req, res) => {
  const items = await query(
    `SELECT id, campaign_name AS "campaignName", status,
            target_count AS "targetCount", sent_count AS "sentCount",
            delivered_count AS "deliveredCount", failed_count AS "failedCount",
            created_at AS "createdAt"
     FROM campaigns WHERE merchant_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [req.auth!.merchantId]
  );
  return sendSuccess(req, res, { items: items.rows });
});

analyticsRouter.get("/campaigns/:id", async (req, res) => {
  const row = await query(
    `SELECT id, campaign_name AS "campaignName", status,
            target_count AS "targetCount", sent_count AS "sentCount",
            delivered_count AS "deliveredCount", failed_count AS "failedCount"
     FROM campaigns WHERE id = $1 AND merchant_id = $2`,
    [req.params.id, req.auth!.merchantId]
  );
  if (!row.rowCount) {
    return sendSuccess(req, res, null);
  }
  return sendSuccess(req, res, row.rows[0]);
});

analyticsRouter.get("/templates", async (req, res) => {
  const items = await query(
    `SELECT t.id, t.name,
            COUNT(DISTINCT c.id)::int AS "campaignCount",
            COUNT(DISTINCT m.id)::int AS "messagesSent"
     FROM templates t
     LEFT JOIN campaigns c ON c.template_id = t.id AND c.merchant_id = t.merchant_id
     LEFT JOIN messages m ON m.campaign_id = c.id
     WHERE t.merchant_id = $1 AND t.archived_at IS NULL
     GROUP BY t.id, t.name
     ORDER BY "messagesSent" DESC`,
    [req.auth!.merchantId]
  );
  return sendSuccess(req, res, { items: items.rows });
});

analyticsRouter.get("/segments", async (req, res) => {
  const merchantId = req.auth!.merchantId;

  const byPincode = await query(
    `SELECT pincode, COUNT(*)::int AS count, COALESCE(SUM(total_spend), 0)::numeric AS revenue
     FROM customers WHERE merchant_id = $1 AND pincode IS NOT NULL
     GROUP BY pincode ORDER BY count DESC LIMIT 20`,
    [merchantId]
  );

  const byAge = await query(
    `SELECT
       CASE
         WHEN age IS NULL THEN 'Unknown'
         WHEN age < 25 THEN 'Under 25'
         WHEN age BETWEEN 25 AND 34 THEN '25-34'
         WHEN age BETWEEN 35 AND 44 THEN '35-44'
         ELSE '45+'
       END AS band,
       COUNT(*)::int AS count
     FROM customers WHERE merchant_id = $1
     GROUP BY 1 ORDER BY count DESC`,
    [merchantId]
  );

  return sendSuccess(req, res, { byPincode: byPincode.rows, byAge: byAge.rows });
});

analyticsRouter.get("/export", async (req, res) => {
  const type = String(req.query.type ?? "customers");
  const merchantId = req.auth!.merchantId;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${type}-export.csv"`);

  if (type === "metrics") {
    const rows = await query(
      `SELECT metric_date, new_customers, visits, revenue, messages_sent, messages_delivered, messages_read
       FROM daily_merchant_metrics WHERE merchant_id = $1 ORDER BY metric_date DESC LIMIT 365`,
      [merchantId]
    );
    res.write("date,new_customers,visits,revenue,messages_sent,messages_delivered,messages_read\n");
    for (const row of rows.rows) {
      res.write(`${Object.values(row).join(",")}\n`);
    }
  } else {
    const rows = await query(
      `SELECT name, mobile, pincode, age, total_spend, total_visits, last_visit, created_at
       FROM customers WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId]
    );
    res.write("name,mobile,pincode,age,total_spend,total_visits,last_visit,created_at\n");
    for (const row of rows.rows) {
      res.write(`${Object.values(row).join(",")}\n`);
    }
  }

  return res.end();
});
