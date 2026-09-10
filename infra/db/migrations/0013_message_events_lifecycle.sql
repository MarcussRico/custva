-- Lifecycle messages have no campaign. Migration 0011 made messages.campaign_id
-- nullable so they could exist, but message_events.campaign_id stayed NOT NULL
-- from 0004 — and the webhook copies the message's campaign_id straight across.
-- Result: every delivery/read receipt for a lifecycle message raised a
-- not-null violation, and lifecycle is the product's core feature.
ALTER TABLE message_events ALTER COLUMN campaign_id DROP NOT NULL;

-- Keep lifecycle events traceable to their schedule, the way campaign events
-- are traceable to their campaign.
ALTER TABLE message_events
  ADD COLUMN IF NOT EXISTS lifecycle_schedule_id UUID
    REFERENCES lifecycle_schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_message_events_lifecycle
  ON message_events (lifecycle_schedule_id)
  WHERE lifecycle_schedule_id IS NOT NULL;

-- Webhook idempotency (defect 4). Meta redelivers status webhooks on any
-- non-2xx or timeout; that is normal traffic, not an error. Without this each
-- redelivery inserted another row and re-incremented the delivery counters the
-- merchant dashboard reports — and that the commission calculation will read.
--
-- Partial unique index: a message may legitimately have one 'sent', one
-- 'delivered' and one 'read' event, but not two of the same.
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_events_message_type
  ON message_events (message_id, event_type);
