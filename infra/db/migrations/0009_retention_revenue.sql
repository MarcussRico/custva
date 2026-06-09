-- Retention revenue: flag repeat visits at write time for fast dashboard aggregates
ALTER TABLE customer_visits
  ADD COLUMN IF NOT EXISTS is_repeat_visit BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customer_visits_merchant_repeat_today
  ON customer_visits (merchant_id, visit_at DESC)
  WHERE is_repeat_visit = TRUE;

ALTER TABLE daily_merchant_metrics
  ADD COLUMN IF NOT EXISTS retention_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Backfill: 2nd+ visit per customer is a repeat visit
UPDATE customer_visits cv
SET is_repeat_visit = TRUE
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY visit_at) AS rn
  FROM customer_visits
) ranked
WHERE cv.id = ranked.id AND ranked.rn > 1;

-- Backfill daily retention_revenue from existing repeat visits
UPDATE daily_merchant_metrics dm
SET retention_revenue = sub.total
FROM (
  SELECT merchant_id, visit_at::date AS metric_date, COALESCE(SUM(billing_amount), 0) AS total
  FROM customer_visits
  WHERE is_repeat_visit = TRUE
  GROUP BY merchant_id, visit_at::date
) sub
WHERE dm.merchant_id = sub.merchant_id AND dm.metric_date = sub.metric_date;
