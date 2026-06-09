-- Customer lifecycle tier tracking
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS lifecycle_tier SMALLINT NOT NULL DEFAULT 0;

-- Lifecycle message schedules
CREATE TABLE IF NOT EXISTS lifecycle_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES customer_visits(id) ON DELETE CASCADE,
  visit_group TEXT NOT NULL,
  lifecycle_day TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES templates(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bull_job_id TEXT,
  sent_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lifecycle_schedules_status_check
    CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  CONSTRAINT lifecycle_schedules_visit_group_check
    CHECK (visit_group IN ('first_visit', 'second_visit', 'third_visit', 'fourth_visit')),
  CONSTRAINT lifecycle_schedules_lifecycle_day_check
    CHECK (lifecycle_day IN ('day_0', 'day_3', 'day_7', 'day_14')),
  UNIQUE (customer_id, visit_id, lifecycle_day)
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_due
  ON lifecycle_schedules (merchant_id, status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lifecycle_customer_pending
  ON lifecycle_schedules (customer_id, status)
  WHERE status = 'pending';

-- Lifecycle messages are not tied to campaigns
ALTER TABLE messages ALTER COLUMN campaign_id DROP NOT NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS lifecycle_schedule_id UUID REFERENCES lifecycle_schedules(id) ON DELETE SET NULL;
