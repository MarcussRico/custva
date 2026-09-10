-- FR-S2's middle fallback is "the merchant's median gap", used when a customer
-- has too little history for their own. Computing it means a window function
-- over every visit for that merchant — far too expensive to run on each visit
-- write, which sits in the POS path (NFR-3).
--
-- So it is cached here and refreshed by the periodic segmentation sweep.
-- NULL is safe: computeExpectedGapDays falls through to the 14-day default.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS median_gap_days NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS median_gap_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN merchants.median_gap_days IS
  'Cached median inter-visit gap across this merchant''s customers; refreshed by the segmentation sweep (FR-S2 fallback)';

-- The sweep and the visit-write path both read a customer''s visit history
-- ordered by date.
CREATE INDEX IF NOT EXISTS idx_customer_visits_customer_visit_at
  ON customer_visits (customer_id, visit_at);
