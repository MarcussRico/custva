import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import { adminMerchantsRouter } from "./merchants.js";
import { adminTemplatesRouter, adminJobsRouter } from "./templates.js";
import { adminAuditRouter } from "./audit.js";
import { query } from "../../lib/db.js";
import { sendSuccess } from "../../lib/api-response.js";

export const adminRouter: Router = Router();

adminRouter.use(requireRole(["platform_admin"]));

adminRouter.use("/merchants", adminMerchantsRouter);
adminRouter.use("/templates", adminTemplatesRouter);
adminRouter.use("/jobs", adminJobsRouter);
adminRouter.use("/audit-logs", adminAuditRouter);

adminRouter.get("/analytics/overview", async (req, res) => {
  const merchants = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM merchants m
     WHERE NOT EXISTS (
       SELECT 1 FROM users u WHERE u.merchant_id = m.id AND u.role = 'platform_admin'
     )`
  );
  const activeCampaigns = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM campaigns WHERE status IN ('scheduled','sending')"
  );
  const messages = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM messages");
  const revenue = await query<{ total: string }>(
    `SELECT COALESCE(SUM(current_revenue), 0)::text AS total
     FROM merchants m
     WHERE NOT EXISTS (
       SELECT 1 FROM users u WHERE u.merchant_id = m.id AND u.role = 'platform_admin'
     )`
  );
  const globalTemplates = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM templates WHERE is_global = TRUE AND archived_at IS NULL`
  );
  return sendSuccess(req, res, {
    totalMerchants: Number(merchants.rows[0].count),
    monthlyRevenue: Number(revenue.rows[0].total),
    activeCampaigns: Number(activeCampaigns.rows[0].count),
    totalMessagesSent: Number(messages.rows[0].count),
    platformCustomerGrowth: 0,
    globalTemplates: Number(globalTemplates.rows[0].count)
  });
});
