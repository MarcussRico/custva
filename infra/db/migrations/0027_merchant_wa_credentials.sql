-- Per-merchant WhatsApp senders.
--
-- Until now the worker built one adapter at startup from environment variables,
-- so every merchant sent from one Custva number. Three consequences, and the
-- third is the one that compounds:
--
--   1. The customer gave their number to the shop, not to Custva, and the
--      sender name is a property of the phone number — it cannot vary per
--      message. So every customer of every shop saw "Custva".
--   2. A name the recipient does not recognise gets blocked and reported far
--      more often.
--   3. Block and report drive Meta's quality rating, and on a shared number
--      that rating is a single pool: one merchant's annoyed customers throttle
--      delivery for everybody else.
--
-- Nullable throughout, and deliberately so. A merchant with no credentials
-- falls back to the platform number, which is what lets a small pilot run
-- shared on exactly the same code path that later runs per-merchant.

ALTER TABLE merchants
  -- The number that sends. Distinct from `mobile` — that is the owner's phone.
  ADD COLUMN IF NOT EXISTS wa_phone_number_id TEXT,
  -- Where this merchant's templates live and are approved.
  ADD COLUMN IF NOT EXISTS wa_business_account_id TEXT,

  -- AES-256-GCM, never plaintext. A long-lived WhatsApp token can send messages
  -- and spend money on the merchant's behalf; a database dump or an errant
  -- SELECT * in a log should not hand that over. Format is iv:tag:ciphertext,
  -- all hex — see lib/merchant-wa-credentials.ts.
  ADD COLUMN IF NOT EXISTS wa_access_token_encrypted TEXT,

  -- What the customer actually sees as the sender. Verified by Meta and
  -- attached to the phone number, which is precisely why one shared number
  -- cannot show different shop names.
  ADD COLUMN IF NOT EXISTS wa_display_name TEXT,

  ADD COLUMN IF NOT EXISTS wa_onboarding_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (wa_onboarding_status IN ('not_started', 'pending', 'connected', 'error')),
  ADD COLUMN IF NOT EXISTS wa_connected_at TIMESTAMPTZ,
  -- The last thing Meta refused, kept so onboarding can say what went wrong
  -- instead of "failed".
  ADD COLUMN IF NOT EXISTS wa_last_error TEXT;

-- An inbound webhook names the phone number it arrived on and nothing else, so
-- this is the lookup that routes a STOP to the right merchant. Unique because
-- two merchants sharing a phone number id is not a state that can be resolved.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchants_wa_phone_number_id
  ON merchants (wa_phone_number_id)
  WHERE wa_phone_number_id IS NOT NULL;

COMMENT ON COLUMN merchants.wa_access_token_encrypted IS
  'AES-256-GCM as iv:tag:ciphertext (hex), keyed by CUSTVA_CREDENTIAL_KEY. Never log or return this column.';
COMMENT ON COLUMN merchants.wa_display_name IS
  'The sender name the customer sees. A property of the phone number, verified by Meta — it cannot be varied per message, which is the whole reason merchants need their own numbers.';
COMMENT ON COLUMN merchants.wa_onboarding_status IS
  'not_started -> pending -> connected | error. A merchant that is not connected falls back to the platform number.';
