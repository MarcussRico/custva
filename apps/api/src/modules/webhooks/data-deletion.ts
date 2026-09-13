import { createHmac } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { env } from "../../config.js";
import { query } from "../../lib/db.js";

/**
 * Meta's Data Deletion Request Callback.
 *
 * Required before Meta will review the `whatsapp_business_management` and
 * `whatsapp_business_messaging` permissions, and those are what Embedded
 * Signup runs on — so this is a hard prerequisite for Tech Provider status.
 *
 * Meta calls this when a person removes the app from their Facebook account.
 * That person is a *merchant* who connected their WhatsApp number through
 * Custva, not a shop's customer. So the correct response is to stop sending on
 * their behalf and destroy the credential they gave us — not to delete a
 * shop's customer records, which belong to the shop and not to Meta.
 *
 * Meta expects `{ url, confirmation_code }` back, and will show the person that
 * URL so they can check the status of their request.
 */

export const dataDeletionRouter: Router = Router();

/**
 * Meta signs the payload with the app secret, base64url, as
 * `signature.payload`. Verified rather than trusted: this endpoint destroys
 * credentials, so an unauthenticated caller must not be able to reach it.
 */
function parseSignedRequest(signed: string, appSecret: string): Record<string, unknown> | null {
  const [encodedSig, payload] = signed.split(".");
  if (!encodedSig || !payload) return null;

  const expected = createHmac("sha256", appSecret).update(payload).digest("base64url");
  /* Length-independent compare without timingSafeEqual's throw on mismatched
     lengths — a wrong-length signature is simply wrong. */
  if (expected.length !== encodedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ encodedSig.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

dataDeletionRouter.post("/data-deletion", async (req: Request, res: Response) => {
  const appSecret = env.WA_APP_SECRET;
  const signed = (req.body as { signed_request?: string })?.signed_request;

  if (!appSecret || typeof signed !== "string") {
    return res.status(400).json({ error: "signed_request is required" });
  }

  const payload = parseSignedRequest(signed, appSecret);
  if (!payload) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const metaUserId = String(payload.user_id ?? "");
  /* A confirmation code the person can quote, and that we can look up. Derived
     rather than random so a repeated request returns the same code instead of
     spawning a new one each time Meta retries. */
  const confirmationCode = createHmac("sha256", appSecret)
    .update(`deletion:${metaUserId}`)
    .digest("hex")
    .slice(0, 20);

  /* Every merchant whose sender was connected under this Meta account stops
     sending, and the stored token is destroyed rather than merely flagged.
     Customer records are untouched: they belong to the shop, and Meta removing
     an app is not the shop asking us to delete its book. */
  const affected = await query<{ id: string }>(
    `UPDATE merchants
        SET wa_access_token_encrypted = NULL,
            wa_onboarding_status = 'not_started',
            wa_connected_at = NULL,
            wa_last_error = 'WhatsApp access removed from the connected Meta account',
            updated_at = NOW()
      WHERE wa_meta_user_id = $1 AND wa_access_token_encrypted IS NOT NULL
      RETURNING id`,
    [metaUserId]
  );

  await query(
    `INSERT INTO data_deletion_requests (meta_user_id, confirmation_code, merchants_affected)
     VALUES ($1, $2, $3)
     ON CONFLICT (confirmation_code) DO UPDATE
        SET merchants_affected = EXCLUDED.merchants_affected, updated_at = NOW()`,
    [metaUserId, confirmationCode, affected.rowCount ?? 0]
  );

  const base = env.PUBLIC_APP_URL ?? "https://custva.com";
  return res.status(200).json({
    url: `${base}/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode
  });
});

/** Where the person Meta redirects can check what happened. */
dataDeletionRouter.get("/data-deletion/status", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  if (!code) return res.status(400).json({ error: "code is required" });

  const row = await query<{
    confirmation_code: string;
    merchants_affected: number;
    created_at: string;
  }>(
    `SELECT confirmation_code, merchants_affected, created_at
       FROM data_deletion_requests WHERE confirmation_code = $1`,
    [code]
  );
  if (!row.rowCount) return res.status(404).json({ error: "Unknown confirmation code" });

  return res.status(200).json({
    confirmationCode: row.rows[0].confirmation_code,
    status: "completed",
    completedAt: row.rows[0].created_at,
    whatWasDeleted:
      "The WhatsApp access token Custva held for this account was destroyed and sending was stopped. Shop customer records were not affected — those belong to the shop and are deleted by asking the shop or Custva directly."
  });
});
