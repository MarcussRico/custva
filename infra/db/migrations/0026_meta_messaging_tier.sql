-- Defect 8 — the send quota models a daily cap, not Meta's actual limit.
--
-- Meta rate-limits a WhatsApp Business phone number by **unique recipients
-- started in a rolling 24 hours**, on a tier: 250 / 1,000 / 10,000 / 100,000 /
-- unlimited. Custva instead counted *messages* against a fixed 500/day that
-- resets at local midnight. Three ways that is the wrong shape:
--
--   1. Messages, not unique recipients. Two messages to one person consume one
--      of Meta's slots and two of Custva's.
--   2. Calendar day, not rolling. 499 sends at 23:50 and 499 more at 00:10 pass
--      Custva's check and blow straight through Meta's window.
--   3. A number invented by us. It has no relationship to the tier the number
--      is actually on, so it is simultaneously too strict for a scaled merchant
--      and useless as protection for a new one.
--
-- Exceeding the real limit does not merely drop messages: it damages the
-- number's quality rating, which is the asset a merchant cannot buy back.

ALTER TABLE merchants
  -- Meta's published tiers. 250 is where every new number starts.
  ADD COLUMN IF NOT EXISTS wa_messaging_tier INTEGER NOT NULL DEFAULT 250
    CHECK (wa_messaging_tier IN (250, 1000, 10000, 100000, 1000000000)),
  -- When Meta last told us. Tiers move on their own as a number warms up, so a
  -- stale value is a fact worth being able to see.
  ADD COLUMN IF NOT EXISTS wa_tier_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN merchants.wa_messaging_tier IS
  'Unique recipients this number may start a conversation with per rolling 24h, per Meta. 1000000000 stands for the unlimited tier. Default 250, where every new number starts.';

-- The rolling-window question is "how many DISTINCT customers has this merchant
-- messaged since NOW() - 24 hours", answered from `messages` — the record of
-- what actually went out, rather than a counter that can drift from it.
CREATE INDEX IF NOT EXISTS idx_messages_merchant_created_customer
  ON messages (merchant_id, created_at DESC, customer_id);
