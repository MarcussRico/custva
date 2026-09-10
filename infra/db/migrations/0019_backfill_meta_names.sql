-- Derive a Meta-valid name for every existing template.
--
-- Mirrors toMetaTemplateName() in @custva/shared: lowercase, non-alphanumerics
-- collapsed to underscores, no leading/trailing underscore. Kept deterministic
-- so resubmitting the same template updates it at Meta rather than creating a
-- duplicate.
--
-- meta_status is deliberately left NULL: none of these have been submitted, and
-- claiming otherwise is exactly the false-approval problem this phase exists to
-- fix. They are named and ready, not approved.
UPDATE templates
SET meta_template_name = NULLIF(
      TRIM(BOTH '_' FROM
        REGEXP_REPLACE(
          REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '_', 'g'),
          '_{2,}', '_', 'g'
        )
      ), ''
    ),
    meta_category = COALESCE(meta_category, 'MARKETING')
WHERE meta_template_name IS NULL;

-- Anything whose name reduced to nothing still needs to be submittable.
UPDATE templates
SET meta_template_name = 'custva_template_' || REPLACE(id::text, '-', '')
WHERE meta_template_name IS NULL;
