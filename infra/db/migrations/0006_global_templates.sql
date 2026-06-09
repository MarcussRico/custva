ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS header_text TEXT,
  ADD COLUMN IF NOT EXISTS footer_text TEXT,
  ADD COLUMN IF NOT EXISTS buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS language_code VARCHAR(10) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_version INT,
  ADD COLUMN IF NOT EXISTS is_locally_modified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_starter_pack BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE templates SET category = 'cafe' WHERE category IS NOT NULL AND category <> 'cafe';

ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_category_cafe_check;
ALTER TABLE templates
  ADD CONSTRAINT templates_category_cafe_check CHECK (category = 'cafe');

CREATE INDEX IF NOT EXISTS idx_templates_global_active
  ON templates (is_global, archived_at)
  WHERE is_global = TRUE;

CREATE INDEX IF NOT EXISTS idx_templates_merchant_active
  ON templates (merchant_id, archived_at)
  WHERE merchant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_templates_source
  ON templates (source_template_id)
  WHERE source_template_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_merchant_source_active
  ON templates (merchant_id, source_template_id)
  WHERE merchant_id IS NOT NULL AND source_template_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants (status);
CREATE INDEX IF NOT EXISTS idx_merchants_pincode ON merchants (pincode);
CREATE INDEX IF NOT EXISTS idx_merchants_business_name_lower ON merchants (lower(business_name));
