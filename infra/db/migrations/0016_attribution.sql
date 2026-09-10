-- SRS §9 (FR-A1..A7) and §11 (DR-3). Tag every visit organic or influenced,
-- and keep enough alongside it to reconstruct *why* (NFR-2).

ALTER TABLE customer_visits
  ADD COLUMN IF NOT EXISTS return_type TEXT NOT NULL DEFAULT 'organic'
    CHECK (return_type IN ('organic', 'custva_influenced')),
  -- FR-A7: the specific message that earned the tag. SET NULL rather than
  -- CASCADE — losing a message must not silently delete billing history.
  ADD COLUMN IF NOT EXISTS attributed_message_id UUID
    REFERENCES messages(id) ON DELETE SET NULL,
  -- The window actually applied, not the window configured today. NFR-4 wants
  -- commission inputs immutable after the visit closes, so retuning the
  -- baseline later must not silently rewrite past decisions.
  ADD COLUMN IF NOT EXISTS attribution_window_days INTEGER,
  -- The segment the customer was in *at the moment they returned*, before this
  -- visit updated it. Without this the Loyal shield (FR-A5) is unauditable:
  -- you cannot tell afterwards whether a visit was organic because no message
  -- reached them, or because they were shielded.
  ADD COLUMN IF NOT EXISTS segment_at_visit TEXT
    CHECK (segment_at_visit IN ('first_time', 'loyal', 'at_risk', 'dormant')),
  ADD COLUMN IF NOT EXISTS attributed_at TIMESTAMPTZ;

-- FR-M1 rollups: influenced revenue per merchant per day.
CREATE INDEX IF NOT EXISTS idx_customer_visits_merchant_return_type
  ON customer_visits (merchant_id, visit_at DESC, return_type);

-- FR-A7 traceability: "which visits did this message earn?"
CREATE INDEX IF NOT EXISTS idx_customer_visits_attributed_message
  ON customer_visits (attributed_message_id)
  WHERE attributed_message_id IS NOT NULL;

-- The attribution lookup itself: recent delivered/read messages for a customer.
CREATE INDEX IF NOT EXISTS idx_messages_customer_engagement
  ON messages (customer_id, COALESCE(opened_at, delivered_at) DESC)
  WHERE opened_at IS NOT NULL OR delivered_at IS NOT NULL;

COMMENT ON COLUMN customer_visits.return_type IS
  'FR-A1: organic | custva_influenced. Only influenced visits may generate commission (FR-M5)';
COMMENT ON COLUMN customer_visits.segment_at_visit IS
  'Segment at the moment of return, captured before this visit updated it — required to audit the FR-A5 Loyal shield';
