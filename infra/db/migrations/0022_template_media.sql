-- Header images for template messages.
--
-- Meta needs a handle from its resumable upload API at template registration
-- time, and that handle is consumed when the template is created. If a template
-- is later edited and resubmitted, Meta wants a *fresh* handle — so the image
-- itself has to be kept, or the merchant is asked to re-upload the same photo
-- every time they change a word.
--
-- The bytes live in Postgres deliberately. A pilot cafe has a handful of
-- product photos at a few hundred KB each; adding S3 to the stack to store
-- perhaps 20 MB is not a trade worth making before there is a second merchant.
-- This should move to object storage before scale, and is noted as such in
-- PROGRESS.md rather than left as a surprise.
CREATE TABLE IF NOT EXISTS template_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
  byte_size INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  -- Lets a repeat upload of the same photo reuse the handle Meta already gave
  -- us instead of spending another round trip.
  checksum TEXT NOT NULL,
  data BYTEA NOT NULL,
  -- NULL until Meta has been given the bytes.
  meta_handle TEXT,
  meta_uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_media_template
  ON template_media (template_id);

CREATE INDEX IF NOT EXISTS idx_template_media_checksum
  ON template_media (merchant_id, checksum);

COMMENT ON COLUMN template_media.data IS
  'Original image bytes, kept so a resubmitted template can get a fresh Meta handle without asking the merchant to upload again';
COMMENT ON COLUMN template_media.meta_handle IS
  'Handle from Metas resumable upload API, used as header_handle when registering the template';
