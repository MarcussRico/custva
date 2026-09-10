-- SRS §10 (FR-M1..M5). Split repeat revenue into organic and influenced, and
-- record commission only on the influenced half.

-- FR-M1. `retention_revenue` already on this table is the sum of *every*
-- repeat visit. It stays as a secondary metric, but §16 is explicit that it
-- must not be labelled as Custva-generated revenue — these two columns are
-- what may be.
ALTER TABLE daily_merchant_metrics
  ADD COLUMN IF NOT EXISTS organic_repeat_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS influenced_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS influenced_visits INTEGER NOT NULL DEFAULT 0;

-- FR-M3. A commercial decision, so it is stored rather than hardcoded, and
-- defaults to zero: no rate agreed means nothing is billed, and a merchant
-- can never be charged because someone forgot to configure them.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0;

-- FR-M4. One row per influenced visit, written once and never recomputed.
--
-- NFR-4 requires commission inputs be immutable after the visit closes, so the
-- rate is copied in at write time rather than joined at read time: re-reading a
-- merchant's current rate would silently restate every historical invoice the
-- day that rate changes. Corrections belong in an explicit adjustment row, not
-- an UPDATE.
CREATE TABLE IF NOT EXISTS commission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  -- ON DELETE RESTRICT: billing history must not vanish because a visit row was
  -- removed. If a visit genuinely needs deleting, the commission has to be
  -- dealt with deliberately first.
  visit_id UUID NOT NULL REFERENCES customer_visits(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- The message that earned it, for the "why am I being charged for this?"
  -- conversation (BR-5).
  attributed_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  influenced_amount NUMERIC(12,2) NOT NULL,
  commission_rate NUMERIC(5,4) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invoiced', 'paid', 'waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- FR-M5 + idempotency: one visit can never bill twice.
  UNIQUE (visit_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_events_merchant_created
  ON commission_events (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commission_events_status
  ON commission_events (merchant_id, status);

COMMENT ON TABLE commission_events IS
  'FR-M4: one immutable row per Custva-influenced visit. Organic visits never appear here (FR-M5)';
COMMENT ON COLUMN daily_merchant_metrics.retention_revenue IS
  'ALL repeat-visit revenue. NOT Custva-generated — see influenced_revenue (SRS §16)';
