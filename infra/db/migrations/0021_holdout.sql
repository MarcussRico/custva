-- Holdout measurement. The `arm` column on campaign_audiences went in back in
-- migration 0014, deliberately ahead of anything reading it, because every
-- campaign that ran without it produced data that can never demonstrate
-- incrementality. This is the rest of the mechanism.

-- Share of an eligible audience deliberately left unmessaged. Default 10%.
-- Zero disables holdouts entirely, which is a legitimate choice for a merchant
-- who would rather message everyone than measure the effect.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS holdout_percent NUMERIC(4,1) NOT NULL DEFAULT 10.0
    CHECK (holdout_percent >= 0 AND holdout_percent <= 50);

-- Recorded per campaign so a later analysis knows what was actually done,
-- rather than re-deriving it from a setting that may since have changed.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS holdout_percent_used NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS holdout_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treatment_count INTEGER NOT NULL DEFAULT 0;

-- Measuring lift means asking "did this customer return after the campaign
-- was sent?", which is a range scan over visits per customer.
CREATE INDEX IF NOT EXISTS idx_customer_visits_customer_visit_at_desc
  ON customer_visits (customer_id, visit_at DESC);

COMMENT ON COLUMN campaigns.holdout_percent_used IS
  'The holdout share actually applied to this campaign. NULL means no holdout was assigned';
COMMENT ON COLUMN campaign_audiences.arm IS
  'treatment = messaged; holdout = deliberately not messaged, so incremental lift can be measured';
