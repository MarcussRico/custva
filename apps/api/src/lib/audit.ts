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

  /* Two ways this used to take down the request it was recording.
     
     `actor_user_id` is a foreign key, and a token outliving its user row — a
     deleted admin, a token minted against a rebuilt database — raised on the
     insert. The subquery resolves an unknown id to NULL, which the column
     already allows, so the trail keeps the action even when it cannot name the
     person.
     
     And the audit is written *after* the work is committed, so a throw here
     returned a 500 for something that had already succeeded: no audit record
     AND a misleading error. Recording who did it is important; it is not more
     important than the caller being told the truth about what happened. */
  try {
    await query(
    `INSERT INTO admin_audit_logs (actor_user_id, action, entity_type, entity_id, before_json, after_json, ip)
     VALUES ((SELECT id FROM users WHERE id = $1::uuid), $2, $3, $4, $5, $6, $7)`,
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
  } catch (error) {
    console.error(`Audit write failed for ${action} on ${entityType} ${entityId}`, error);
  }
}
