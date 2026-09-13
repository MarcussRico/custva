-- Defect 5 — a failed batch re-sends.
--
-- One BullMQ job carries up to 100 recipients and `attempts: 5`. Send failures
-- are caught per recipient, but a *database* error is not: it propagates out of
-- the loop, the whole job fails, and BullMQ replays the batch from the top. A
-- failure at recipient 40 therefore re-messages recipients 1-39, up to five
-- times over.
--
-- That is real money, and duplicate marketing messages are precisely what
-- destroys a WhatsApp number's quality rating — the one asset a merchant cannot
-- buy back.
--
-- The fix is to make dispatch idempotent per recipient rather than per job.
-- `campaign_audiences` already holds exactly one row per (campaign, customer),
-- so it becomes the claim ledger: a recipient is claimed with a conditional
-- UPDATE before anything is sent, and a replay finds nothing left to claim.
--
-- Deliberately "at most once", not "at least once". If the process dies between
-- the claim and the send, that recipient is left in 'sending' and never
-- retried. For paid marketing messages the conservative direction is to miss
-- one rather than send it twice — and a stuck row is visible and recoverable,
-- whereas a double send is not.

ALTER TABLE campaign_audiences
  ADD COLUMN IF NOT EXISTS dispatch_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (dispatch_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS dispatch_attempted_at TIMESTAMPTZ,
  -- Why a recipient was skipped or failed, in the merchant's terms. Without it
  -- "sent 38 of 40" is a number with no explanation attached.
  ADD COLUMN IF NOT EXISTS dispatch_note TEXT;

-- The claim is a point read on (campaign_id, customer_id), already covered by
-- the unique constraint. This one serves the "what is left / what got stuck"
-- queries that make a partial send legible.
CREATE INDEX IF NOT EXISTS idx_campaign_audiences_dispatch
  ON campaign_audiences (campaign_id, dispatch_status);

COMMENT ON COLUMN campaign_audiences.dispatch_status IS
  'Per-recipient claim, so a retried batch cannot re-send. pending -> sending -> sent|failed|skipped. A row stuck in sending means the worker died mid-flight; it is never retried automatically, by design.';
