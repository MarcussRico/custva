import type { PoolClient } from "pg";

/**
 * Defect 5 — claim a recipient before sending, so a replayed batch cannot
 * re-send to anyone it already reached.
 *
 * One BullMQ job carries up to 100 recipients with `attempts: 5`. Provider
 * errors were caught per recipient, but a database error was not: it escaped
 * the loop, failed the job, and BullMQ replayed the batch from recipient one.
 * A failure at recipient 40 re-messaged 1-39, up to five times.
 *
 * `campaign_audiences` holds exactly one row per (campaign, customer), so the
 * conditional UPDATE below is the claim: only a row still `pending` can be
 * taken, and a replay finds nothing to take.
 *
 * Returns false when this recipient has already been handled. Rows only exist
 * for a snapshotted campaign audience, so a single ad-hoc dispatch with no row
 * proceeds unclaimed rather than being silently dropped — there is nothing to
 * be idempotent against.
 */
export async function claimRecipient(
  client: PoolClient,
  campaignId: string,
  customerId: string
): Promise<boolean> {
  const result = await client.query<{ claimed: number; known: number }>(
    `WITH claimed AS (
       UPDATE campaign_audiences
          SET dispatch_status = 'sending', dispatch_attempted_at = NOW()
        WHERE campaign_id = $1 AND customer_id = $2 AND dispatch_status = 'pending'
       RETURNING id
     )
     SELECT (SELECT COUNT(*) FROM claimed)::int AS claimed,
            (SELECT COUNT(*) FROM campaign_audiences
              WHERE campaign_id = $1 AND customer_id = $2)::int AS known`,
    [campaignId, customerId]
  );
  const { claimed, known } = result.rows[0];
  if (claimed > 0) return true;
  if (known === 0) return true;
  return false;
}

/** Record the outcome against the claim. Never throws — see settleQuietly. */
export async function settle(
  client: PoolClient,
  campaignId: string,
  customerId: string,
  status: "sent" | "failed" | "skipped",
  note?: string
): Promise<void> {
  await client.query(
    `UPDATE campaign_audiences
        SET dispatch_status = $3, dispatch_note = $4
      WHERE campaign_id = $1 AND customer_id = $2`,
    [campaignId, customerId, status, note ?? null]
  );
}

/**
 * Marking the outcome must never be what fails a send.
 *
 * Once the provider has accepted the message it is gone; a bookkeeping error
 * after that point cannot be allowed to throw, or the recipient looks unsent
 * and gets messaged again on the retry — reintroducing the exact defect.
 */
export async function settleQuietly(
  client: PoolClient,
  campaignId: string,
  customerId: string,
  status: "sent" | "failed" | "skipped",
  note?: string
): Promise<void> {
  try {
    await settle(client, campaignId, customerId, status, note);
  } catch (error) {
    console.error(`Could not record dispatch outcome for ${customerId}`, error);
  }
}

