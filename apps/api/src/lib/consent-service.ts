import type { PoolClient } from "pg";
import {
  type ConsentAction,
  type ConsentMethod,
  type ConsentSource,
  type ConsentState,
  stateAfter
} from "@custva/shared";
import { query } from "./db.js";

/**
 * Writes to the consent ledger — defect 7.
 *
 * Every path that changes a customer's consent goes through here, so that the
 * ledger row and the projection on `customers` can never disagree. They are
 * written in one statement pair inside the caller's transaction; a consent
 * state with no evidence behind it is precisely the thing this replaces.
 */

export interface RecordConsentInput {
  merchantId: string;
  customerId: string;
  action: ConsentAction;
  method: ConsentMethod;
  source: ConsentSource;
  /** The wording the customer was shown or read out, verbatim. */
  noticeText?: string | null;
  noticeVersion?: string | null;
  recordedBy?: string | null;
  /** Inbound message id, import batch — whatever proves this happened. */
  evidence?: Record<string, unknown> | null;
  occurredAt?: Date | string | null;
}

/**
 * Which staff member recorded it is *optional* metadata; the consent record is
 * not. So an id that cannot be stored must never be able to fail the write.
 *
 * Two ways it can be unusable, and both were reachable. The dev auth bypass
 * sets `userId` to the literal "dev-user", which is not a UUID and fails on the
 * cast. And a well-formed UUID for a user that no longer exists — a deleted
 * staff account, a token outliving its row — fails on the foreign key; that one
 * only surfaced when the endpoint was driven for real, returning a 500 and
 * storing nothing at all.
 *
 * The regex drops the first case. The subquery in the INSERT resolves the
 * second to NULL instead of raising. Losing "which staff member" is bad; losing
 * the consent record is worse.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUserId(value: string | null | undefined): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export interface ConsentRecord {
  id: string;
  action: ConsentAction;
  method: ConsentMethod;
  source: ConsentSource;
  noticeText: string | null;
  noticeVersion: string | null;
  /**
   * What the customer actually sent, for anything they originated. For a
   * counter grant the evidence is the notice they were read; for a STOP it is
   * their own words, and showing "replied on WhatsApp" without them hides the
   * only thing that proves what was asked for.
   */
  inboundBody: string | null;
  occurredAt: string;
}

/**
 * Append a ledger row and move the projection to match.
 *
 * Returns null when the row was a duplicate — Meta redelivers inbound webhooks
 * on any non-2xx, and the unique index on the provider message id turns the
 * replay into a no-op rather than five identical "she said stop" records.
 */
export async function recordConsent(
  client: PoolClient,
  input: RecordConsentInput
): Promise<ConsentRecord | null> {
  const inserted = await client.query<{
    id: string;
    action: ConsentAction;
    method: ConsentMethod;
    source: ConsentSource;
    notice_text: string | null;
    notice_version: string | null;
    inbound_body: string | null;
    occurred_at: string;
  }>(
    `INSERT INTO consents (
       merchant_id, customer_id, action, method, source,
       notice_text, notice_version, recorded_by, evidence, occurred_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,
       (SELECT id FROM users WHERE id = $8::uuid),
       $9,
       COALESCE($10::timestamptz, NOW())
     )
     ON CONFLICT DO NOTHING
     RETURNING id, action, method, source, notice_text, notice_version,
               evidence ->> 'body' AS inbound_body, occurred_at`,
    [
      input.merchantId,
      input.customerId,
      input.action,
      input.method,
      input.source,
      input.noticeText ?? null,
      input.noticeVersion ?? null,
      asUserId(input.recordedBy),
      input.evidence ? JSON.stringify(input.evidence) : null,
      input.occurredAt ?? null
    ]
  );

  if (!inserted.rowCount) return null;

  const state: ConsentState = stateAfter(input.action);

  /* The projection only moves forward in time. A late-arriving webhook for an
     event that predates the customer's current state must not resurrect it —
     if she said STOP on Tuesday and a delayed Monday "START" lands on
     Wednesday, she is still stopped.

     `whatsapp_opt_in` is kept in step because the worker and six other queries
     still read it. consent_state is authoritative; the boolean is a mirror. */
  await client.query(
    `UPDATE customers
        SET consent_state = $1,
            consent_updated_at = $2,
            whatsapp_opt_in = $3,
            updated_at = NOW()
      WHERE id = $4
        AND merchant_id = $5
        AND (consent_updated_at IS NULL OR consent_updated_at <= $2)`,
    [
      state,
      inserted.rows[0].occurred_at,
      state === "granted",
      input.customerId,
      input.merchantId
    ]
  );

  const row = inserted.rows[0];
  return {
    id: row.id,
    action: row.action,
    method: row.method,
    source: row.source,
    noticeText: row.notice_text,
    noticeVersion: row.notice_version,
    inboundBody: row.inbound_body,
    occurredAt: row.occurred_at
  };
}

/** The full history for one customer, newest first. Read-only, never trimmed. */
export async function getConsentHistory(
  merchantId: string,
  customerId: string
): Promise<ConsentRecord[]> {
  const result = await query<{
    id: string;
    action: ConsentAction;
    method: ConsentMethod;
    source: ConsentSource;
    notice_text: string | null;
    notice_version: string | null;
    inbound_body: string | null;
    occurred_at: string;
  }>(
    `SELECT id, action, method, source, notice_text, notice_version,
            evidence ->> 'body' AS inbound_body, occurred_at
       FROM consents
      WHERE merchant_id = $1 AND customer_id = $2
      ORDER BY occurred_at DESC, created_at DESC`,
    [merchantId, customerId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    action: r.action,
    method: r.method,
    source: r.source,
    noticeText: r.notice_text,
    noticeVersion: r.notice_version,
    inboundBody: r.inbound_body,
    occurredAt: r.occurred_at
  }));
}

/**
 * Resolve an inbound WhatsApp number to a customer.
 *
 * A STOP arrives with a phone number and nothing else — no merchant, no
 * customer id. One number can belong to the same person at several merchants,
 * and a withdrawal is addressed to the business that messaged them, so this
 * returns every match and the caller records one withdrawal per merchant the
 * number is actually known to.
 */
export async function findCustomersByMobile(
  mobile: string
): Promise<Array<{ id: string; merchantId: string }>> {
  const result = await query<{ id: string; merchant_id: string }>(
    /* Meta sends the number in E.164 without a "+" ("919840112255"). Stored
       numbers are 10-digit local. Match on the last 10 digits rather than
       guessing which form arrived. */
    `SELECT id, merchant_id FROM customers
      WHERE RIGHT(regexp_replace(mobile, '\\D', '', 'g'), 10)
          = RIGHT(regexp_replace($1, '\\D', '', 'g'), 10)`,
    [mobile]
  );
  return result.rows.map((r) => ({ id: r.id, merchantId: r.merchant_id }));
}
