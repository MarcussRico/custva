-- Consent — defect 7, and a hard gate on any real send.
--
-- Until now consent was `customers.whatsapp_opt_in BOOLEAN NOT NULL DEFAULT
-- TRUE`, hardcoded TRUE on insert. That is not consent; it is an assumption
-- stored in a column. Meta requires explicit opt-in before a template reaches
-- anyone, and the DPDP Act requires it recorded — what was said, when, by what
-- means — and revocable. A boolean answers none of that, and it cannot answer
-- it after a complaint, which is the only time anyone asks.
--
-- Two design decisions carry the weight here.
--
-- 1. The ledger is append-only. Consent state is a projection of it, never the
--    other way round. Updating a boolean destroys exactly the history that is
--    the point: a withdrawal has to stay legible years later, next to the grant
--    it revoked.
--
-- 2. Existing customers are recorded as UNKNOWN, not granted. Backfilling them
--    as granted would write consent records for conversations that never
--    happened — fabricating evidence, which is a worse failure than having
--    none. `unknown` is a real third state and the product surfaces it.

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  action TEXT NOT NULL CHECK (action IN ('granted', 'withdrawn')),

  -- How it happened. "She agreed" and "she signed a form" carry different
  -- evidentiary weight, and a regulator asks how, not merely whether.
  method TEXT NOT NULL CHECK (method IN (
    'counter_verbal',
    'counter_form',
    'whatsapp_reply',
    'merchant_import',
    'admin_correction'
  )),

  source TEXT NOT NULL CHECK (source IN ('merchant_staff', 'customer', 'system')),

  -- The wording the customer was actually shown or read out, verbatim, plus a
  -- version tag. Consent is to a specific statement; if the statement changes,
  -- prior consent was to the old one and this is how that stays provable.
  notice_text TEXT,
  notice_version TEXT,

  -- Which staff account recorded it. Null when the customer acted themselves.
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Provenance for anything machine-originated: the inbound WhatsApp message
  -- id and its raw body for a STOP, the import batch for a bulk load. This is
  -- the artefact produced if the record is ever challenged.
  evidence JSONB,

  -- When the customer actually acted, which is not always when we recorded it.
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The common read is "what is this customer's latest consent event".
CREATE INDEX IF NOT EXISTS idx_consents_customer_occurred
  ON consents (customer_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_consents_merchant_occurred
  ON consents (merchant_id, occurred_at DESC);

-- An inbound STOP arrives more than once whenever Meta redelivers. Without
-- this, one customer's single "STOP" becomes five identical ledger rows and the
-- audit trail stops being an audit trail.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consents_inbound_message
  ON consents ((evidence ->> 'providerMessageId'))
  WHERE evidence ? 'providerMessageId';

-- Projection of the ledger, denormalised onto the customer so the audience
-- query stays a single scan. Never written by hand — only alongside a ledger
-- insert. `unknown` is the default *and* the backfill value: every row that
-- predates this migration genuinely has no recorded consent.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS consent_state TEXT NOT NULL DEFAULT 'unknown'
    CHECK (consent_state IN ('granted', 'withdrawn', 'unknown')),
  ADD COLUMN IF NOT EXISTS consent_updated_at TIMESTAMPTZ;

-- Partial index: the audience engine filters out 'withdrawn' on every send, and
-- withdrawn is the small set.
CREATE INDEX IF NOT EXISTS idx_customers_consent_state
  ON customers (merchant_id, consent_state);

COMMENT ON TABLE consents IS
  'Append-only consent ledger. Never UPDATE or DELETE a row here — customers.consent_state is the projection.';
COMMENT ON COLUMN customers.consent_state IS
  'Projection of the consents ledger. "unknown" means no record exists, which is NOT permission.';
COMMENT ON COLUMN customers.whatsapp_opt_in IS
  'Legacy boolean, retained so existing queries keep working. consent_state is authoritative; whatsapp_opt_in is kept in step with it.';
