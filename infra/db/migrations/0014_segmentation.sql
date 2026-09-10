-- SRS Feature-Implementation.md §7 (FR-S1..S5) and §11 (DR-2).
-- Deterministic, explainable segmentation. No ML: TR-1 requires the v1 rules be
-- auditable, and a cafe owner has to be able to understand why someone is
-- "At-Risk" (NFR-1).

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS segment TEXT
    CHECK (segment IN ('first_time', 'loyal', 'at_risk', 'dormant')),
  -- NUMERIC not INTEGER: a median of an even number of intervals is a .5
  ADD COLUMN IF NOT EXISTS expected_gap_days NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS expected_revisit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS segment_updated_at TIMESTAMPTZ;

-- Audience selection filters on segment (FR-I1), and the periodic sweep finds
-- work by asking "who is overdue and not yet reclassified" (FR-S4).
CREATE INDEX IF NOT EXISTS idx_customers_merchant_segment
  ON customers (merchant_id, segment);

CREATE INDEX IF NOT EXISTS idx_customers_expected_revisit
  ON customers (expected_revisit_at)
  WHERE expected_revisit_at IS NOT NULL;

-- ── Holdout arm ────────────────────────────────────────────────────────────
-- Not in the SRS. Deliberately added before anything reads it.
--
-- FR-A3 attributes a return to any message delivered in the previous 7 days,
-- which is correlation: a merchant can always answer "they would have come back
-- anyway", and last-touch cannot refute that. A randomised holdout can, because
-- the held-out group *is* the people who would have come back anyway.
--
-- campaign_audiences already snapshots exactly who was selected per campaign,
-- so this is one column rather than a new table. It costs nothing at today's
-- volume, and every campaign that runs without it is data that can never
-- demonstrate incrementality. That is why it lands now and not in Phase E.
ALTER TABLE campaign_audiences
  ADD COLUMN IF NOT EXISTS arm TEXT NOT NULL DEFAULT 'treatment'
    CHECK (arm IN ('treatment', 'holdout'));

CREATE INDEX IF NOT EXISTS idx_campaign_audiences_arm
  ON campaign_audiences (campaign_id, arm);

COMMENT ON COLUMN customers.expected_gap_days IS
  'Median days between this customer''s consecutive visits; merchant median or 14 as fallback (FR-S2)';
COMMENT ON COLUMN customers.segment IS
  'FR-S3 baseline: first_time | loyal | at_risk | dormant';
COMMENT ON COLUMN campaign_audiences.arm IS
  'treatment = messaged; holdout = deliberately not messaged, to measure incremental lift';
