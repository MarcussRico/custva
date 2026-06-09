import type { Request } from "express";
import { query } from "./db.js";

export async function writeAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId: string | null,
  before: unknown,
  after: unknown
) {
  const actorUserId = req.auth?.userId;
  if (!actorUserId || actorUserId === "dev-user") {
    return;
  }

  await query(
    `INSERT INTO admin_audit_logs (actor_user_id, action, entity_type, entity_id, before_json, after_json, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      actorUserId,
      action,
      entityType,
      entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      req.ip ?? null
    ]
  );
}
