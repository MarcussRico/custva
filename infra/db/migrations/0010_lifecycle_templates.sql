-- Lifecycle template catalog fields
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS visit_group TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_day TEXT,
  ADD COLUMN IF NOT EXISTS header_image_url TEXT;

ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_visit_group_check;
ALTER TABLE templates ADD CONSTRAINT templates_visit_group_check
  CHECK (visit_group IS NULL OR visit_group IN ('first_visit', 'second_visit', 'third_visit', 'fourth_visit'));

ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_lifecycle_day_check;
ALTER TABLE templates ADD CONSTRAINT templates_lifecycle_day_check
  CHECK (lifecycle_day IS NULL OR lifecycle_day IN ('day_0', 'day_3', 'day_7', 'day_14'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_merchant_lifecycle_active
  ON templates (merchant_id, visit_group, lifecycle_day)
  WHERE archived_at IS NULL AND visit_group IS NOT NULL;

-- One-shot archive of pre-lifecycle templates.
-- Skip if a lifecycle catalog is already present (safe if re-run without tracking).
UPDATE templates SET archived_at = NOW(), updated_at = NOW()
WHERE archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM templates
    WHERE is_global = TRUE AND visit_group IS NOT NULL AND archived_at IS NULL
  );

-- Seed 16 global lifecycle templates (Meta names must match approved templates)
INSERT INTO templates (
  merchant_id, name, category, body, header_text, footer_text, buttons,
  language_code, header_image_url, visit_group, lifecycle_day,
  is_global, approval_status, is_starter_pack, version
)
SELECT
  NULL,
  v.name,
  'cafe',
  v.body,
  v.header_text,
  v.footer_text,
  v.buttons::jsonb,
  'en',
  v.header_image_url,
  v.visit_group,
  v.lifecycle_day,
  TRUE,
  'approved',
  TRUE,
  1
FROM (VALUES
  ('custva_first_visit_day_0', 'first_visit', 'day_0', 'Welcome to {{shop_name}}!', 'Hi {{name}}, thanks for your first visit! We are glad you chose us.', 'See you again soon', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_first_visit_day_3', 'first_visit', 'day_3', 'We hope you enjoyed {{shop_name}}', 'Hi {{name}}, it has been a few days since your visit. Come back for something special!', 'Your cafe family', '[{"type":"url","text":"Get directions","value":"https://custva.local"}]', NULL),
  ('custva_first_visit_day_7', 'first_visit', 'day_7', 'A week since we met!', 'Hi {{name}}, we would love to see you again at {{shop_name}} this week.', 'Loyalty rewards await', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_first_visit_day_14', 'first_visit', 'day_14', 'We miss you at {{shop_name}}', 'Hi {{name}}, it has been two weeks! Drop by for a loyalty surprise.', 'From all of us', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_second_visit_day_0', 'second_visit', 'day_0', 'Welcome back!', 'Hi {{name}}, great to see you again at {{shop_name}}! Thank you for returning.', 'We appreciate you', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_second_visit_day_3', 'second_visit', 'day_3', 'Thanks for being a regular', 'Hi {{name}}, as a returning guest at {{shop_name}}, here is a little thank-you.', 'Valid this week', '[{"type":"url","text":"Claim offer","value":"https://custva.local"}]', NULL),
  ('custva_second_visit_day_7', 'second_visit', 'day_7', 'Your loyalty matters', 'Hi {{name}}, we noticed it has been a week. {{shop_name}} has something for loyal guests.', 'See you soon', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_second_visit_day_14', 'second_visit', 'day_14', 'Come back to {{shop_name}}', 'Hi {{name}}, two weeks since your last visit. We have saved a treat for you.', 'Loyalty perk', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_third_visit_day_0', 'third_visit', 'day_0', 'You are a regular now!', 'Hi {{name}}, your third visit to {{shop_name}} means a lot to us. Thank you!', 'VIP guest', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_third_visit_day_3', 'third_visit', 'day_3', 'VIP appreciation', 'Hi {{name}}, loyal guests like you make {{shop_name}} special.', 'Exclusive offer', '[{"type":"url","text":"Claim offer","value":"https://custva.local"}]', NULL),
  ('custva_third_visit_day_7', 'third_visit', 'day_7', 'We value your loyalty', 'Hi {{name}}, a week since your visit. {{shop_name}} has a VIP surprise waiting.', 'For our regulars', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_third_visit_day_14', 'third_visit', 'day_14', 'Your table awaits', 'Hi {{name}}, it has been two weeks. Come back to {{shop_name}} for your loyalty reward.', 'Thank you', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_fourth_visit_day_0', 'fourth_visit', 'day_0', 'Champion guest!', 'Hi {{name}}, you are one of our best guests at {{shop_name}}. Thank you for your loyalty!', 'Champion tier', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_fourth_visit_day_3', 'fourth_visit', 'day_3', 'Champion appreciation', 'Hi {{name}}, as a champion guest, {{shop_name}} has an exclusive offer for you.', 'Limited time', '[{"type":"url","text":"Claim offer","value":"https://custva.local"}]', NULL),
  ('custva_fourth_visit_day_7', 'fourth_visit', 'day_7', 'Champion loyalty reward', 'Hi {{name}}, we miss our champion guests! Visit {{shop_name}} this week.', 'VIP only', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL),
  ('custva_fourth_visit_day_14', 'fourth_visit', 'day_14', 'Champion comeback', 'Hi {{name}}, two weeks is too long! {{shop_name}} has saved your champion reward.', 'See you soon', '[{"type":"url","text":"Visit us","value":"https://custva.local"}]', NULL)
) AS v(name, visit_group, lifecycle_day, header_text, body, footer_text, buttons, header_image_url)
WHERE NOT EXISTS (
  SELECT 1 FROM templates t
  WHERE t.is_global = TRUE AND t.name = v.name AND t.archived_at IS NULL
);
