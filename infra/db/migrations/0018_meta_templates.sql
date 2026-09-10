-- Meta template identity and approval state, kept separate from the
-- merchant-facing name.
--
-- Before this, `approval_status` meant "an admin clicked approve in the Custva
-- panel" and the name sent to Meta was `templates.name` — free text like
-- "Brownie Day 3". Meta requires a pre-registered, lowercase snake_case name,
-- so with real credentials essentially every send would have failed.

ALTER TABLE templates
  -- Deterministic snake_case derivation of the merchant-facing name.
  ADD COLUMN IF NOT EXISTS meta_template_name TEXT,
  -- Meta's status, not ours. NULL means never submitted.
  ADD COLUMN IF NOT EXISTS meta_status TEXT
    CHECK (meta_status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED')),
  ADD COLUMN IF NOT EXISTS meta_category TEXT
    CHECK (meta_category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  -- Meta's terse rejection text, surfaced to the merchant rather than swallowed.
  ADD COLUMN IF NOT EXISTS meta_rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS meta_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meta_synced_at TIMESTAMPTZ,
  -- Meta's own id for the template, used to poll status.
  ADD COLUMN IF NOT EXISTS meta_template_id TEXT,
  -- Uploaded media handle for an image-header template (M4). Meta needs a
  -- handle from its resumable upload API, not a URL, at registration time.
  ADD COLUMN IF NOT EXISTS header_image_handle TEXT;

-- The send path asks "is this template approved at Meta?" per campaign.
CREATE INDEX IF NOT EXISTS idx_templates_meta_status
  ON templates (merchant_id, meta_status);

-- One Meta template name per merchant. Resubmitting the same Custva template
-- must update rather than duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_templates_merchant_meta_name
  ON templates (merchant_id, meta_template_name)
  WHERE meta_template_name IS NOT NULL;

COMMENT ON COLUMN templates.approval_status IS
  'Custva-internal review state. NOT Meta approval — see meta_status';
COMMENT ON COLUMN templates.meta_status IS
  'Approval state at Meta. Only APPROVED templates may be sent';
