-- Defect 10 — the "birthday month" filter was the signup month.
--
-- `EXTRACT(MONTH FROM c.created_at)` is when the customer was first entered
-- into Custva, not when they were born. A merchant sending birthday offers in
-- March reached everyone they happened to sign up in March. It returned a
-- plausible number of plausible-looking people, which is why nobody caught it.
--
-- There was no date of birth to read: the only field is a static `age` integer,
-- typed once at the counter and wrong from the next birthday onward.
--
-- Adds a real date of birth. Deliberately nullable and never inferred — a
-- customer whose birthday is unknown must match no birthday campaign, which is
-- the whole point. `age` stays for the customers who only ever gave that.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS date_of_birth DATE
    CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE);

-- Birthday campaigns scan by month across the whole book.
CREATE INDEX IF NOT EXISTS idx_customers_birth_month
  ON customers (merchant_id, (EXTRACT(MONTH FROM date_of_birth)))
  WHERE date_of_birth IS NOT NULL;

COMMENT ON COLUMN customers.date_of_birth IS
  'Real date of birth, when the customer gave one. Age is derived from this where present; the static `age` column is the fallback for customers who only gave an age and goes stale by a year every birthday.';
COMMENT ON COLUMN customers.age IS
  'Age as typed at the counter. Stale by design after the customer''s next birthday — prefer date_of_birth where it exists.';
