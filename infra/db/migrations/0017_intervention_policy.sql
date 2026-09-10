-- SRS §8 (FR-I1..I5) and TR-5. Two things the send path needs to enforce
-- policy rather than trust the UI.

-- FR-I2 — Loyal discount protection. Enforcement needs to know which templates
-- are actually discounts; "category" is free text and every existing row says
-- 'cafe', so it carries no signal. Defaults to FALSE: a template is only a
-- discount offer if someone says so, and a mislabelled template errs toward
-- being sendable rather than silently blocking a merchant's campaign.
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS is_discount_offer BOOLEAN NOT NULL DEFAULT FALSE;

-- FR-I2's explicit-override clause. Blocking a merchant outright is wrong;
-- making them state the intent is the point.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS include_loyal_override BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-customer frequency cap. The existing quota is per *merchant* per day
-- (500), which does nothing to stop one unlucky customer receiving every
-- message a merchant sends. Meta's quality rating is driven by individual
-- recipients blocking and reporting, so the cap that protects the sending
-- number is the per-person one.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS customer_message_cap INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS customer_message_cap_days INTEGER NOT NULL DEFAULT 7;

-- The cap check runs per recipient on the send path, so it must be cheap.
CREATE INDEX IF NOT EXISTS idx_messages_customer_created
  ON messages (customer_id, created_at DESC);

COMMENT ON COLUMN templates.is_discount_offer IS
  'FR-I2: discount/deep-offer templates are withheld from Loyal customers unless the campaign sets include_loyal_override';
COMMENT ON COLUMN merchants.customer_message_cap IS
  'Max Custva messages one customer may receive in customer_message_cap_days';
