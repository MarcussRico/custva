import { Router } from "express";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { query } from "../../lib/db.js";

export const adminAuditRouter: Router = Router();

adminAuditRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const entityType = typeof req.query.entityType === "string" ? req.query.entityType : "";

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (entityType) {
    conditions.push(`entity_type = $${idx}`);
    params.push(entityType);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const count = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM admin_audit_logs ${where}`,
    params
  );

  params.push(limit, offset);
  const logs = await query(
    `SELECT id, actor_user_id AS "actorUserId", action, entity_type AS "entityType",
            entity_id AS "entityId", before_json AS "before", after_json AS "after",
            ip, created_at AS "createdAt"
     FROM admin_audit_logs ${where}
     ORDER BY created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return sendSuccess(req, res, {
    items: logs.rows,
    page,
    limit,
    total: Number(count.rows[0].count)
  });
});

adminAuditRouter.get("/:id", async (req, res) => {
  const log = await query(
    `SELECT id, actor_user_id AS "actorUserId", action, entity_type AS "entityType",
            entity_id AS "entityId", before_json AS "before", after_json AS "after",
            ip, created_at AS "createdAt"
     FROM admin_audit_logs WHERE id = $1`,
    [req.params.id]
  );
  if (!log.rowCount) {
    return sendError(req, res, "RESOURCE_NOT_FOUND", "Audit log not found", 404);
  }
  return sendSuccess(req, res, log.rows[0]);
});
