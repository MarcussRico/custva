-- Meta's Data Deletion Request Callback needs somewhere to record what it did.
--
-- Meta calls the endpoint when a person removes the app from their Facebook
-- account, expects a confirmation code back, and then shows that person a URL
-- where they can check the status. So the code has to be looked up later,
-- which means it has to be stored.
--
-- The person removing the app is a *merchant* who connected their WhatsApp
-- number, not a shop's customer. What gets destroyed is the credential they
-- gave us. A shop's customer records are the shop's, and Meta removing an app
-- is not the shop asking for its book to be deleted.

-- Which Meta account connected a merchant's sender, so a deletion request can
-- find the right merchants.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS wa_meta_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_merchants_wa_meta_user_id
  ON merchants (wa_meta_user_id) WHERE wa_meta_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_user_id TEXT NOT NULL,
  -- Derived from the user id rather than random, so Meta's retries return the
  -- same code instead of spawning a new request each time.
  confirmation_code TEXT NOT NULL UNIQUE,
  merchants_affected INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE data_deletion_requests IS
  'Meta data-deletion callbacks. Records that a merchant''s WhatsApp credential was destroyed; never touches shop customer data.';
