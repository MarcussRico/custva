import { Router } from "express";
import { sendSuccess } from "../../lib/api-response.js";
import { query } from "../../lib/db.js";

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
  const revenue = await query<{ total: string }>(
    "SELECT COALESCE(SUM(total_spend), 0)::text AS total FROM customers WHERE merchant_id = $1",
    [merchantId]
  );
  const totalCustomers = Number(customers.rows[0].count);
  const repeatCustomers = Number(repeat.rows[0].count);
  const retentionRate =
    totalCustomers === 0 ? 0 : Number(((repeatCustomers / totalCustomers) * 100).toFixed(2));

  return sendSuccess(req, res, {
    totalCustomers,
    repeatCustomers,
    retentionRate,
    customerGrowth: 0,
    revenueGrowth: 0,
    campaignConversion: 0,
    activeCustomers: totalCustomers,
    inactiveCustomers: 0,
    revenueFromCampaigns: Number(revenue.rows[0].total)
  });
});

analyticsRouter.get("/retention", (req, res) => {
  return sendSuccess(req, res, {
    range: req.query.range ?? "30d",
    series: [
      { date: "2026-05-01", retentionRate: 26.2 },
      { date: "2026-05-10", retentionRate: 27.4 },
      { date: "2026-05-20", retentionRate: 29.6 },
      { date: "2026-05-28", retentionRate: 30.8 }
    ]
  });
});

analyticsRouter.get("/campaigns/:id", (req, res) => {
  return sendSuccess(req, res, {
    campaignId: req.params.id,
    sent: 220,
    delivered: 207,
    read: 153,
    failed: 13,
    conversions: 24,
    revenueAttributed: 35600
  });
});
