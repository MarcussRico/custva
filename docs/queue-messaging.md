# Queue and Messaging Design (BullMQ + Redis)

## Goals

- Support high-volume campaign sends without blocking API response time.
- Ensure delivery state is eventually consistent and traceable.
- Recover safely from provider/API errors with deterministic retries.

## Queue topology

- `campaign_dispatch_queue`: fan-out jobs per recipient
- `lifecycle_dispatch_queue`: delayed per-customer lifecycle WhatsApp sends (Day 0/3/7/14)
- `message_status_reconcile_queue`: delayed reconciliation for uncertain states
- `analytics_projection_queue`: updates materialized metrics after status events
- `dead_letter_queue`: exhausted jobs for manual/operator review

## Job contracts

### Lifecycle dispatch job

Queue: `lifecycle_dispatch_queue`

Triggered by `POST /customers` after each visit. Schedules four milestones per visit tier (capped at fourth visit).

```json
{
  "jobType": "lifecycle.dispatch",
  "scheduleId": "uuid"
}
```

- Job ID: `lifecycle:{scheduleId}` (idempotent)
- Delay: `scheduled_at - now()` (Day 0 = visit + 5 minutes; Day 3/7/14 = visit + N days)
- On new visit: pending schedules for customer are cancelled and BullMQ jobs removed
- Worker sends full Meta template components (header image/text, body variables, URL button params)

### Campaign dispatch job

Queue: `campaign_dispatch_queue`

```json
{
  "jobType": "campaign.dispatch",
  "campaignId": "uuid",
  "merchantId": "uuid",
  "customerId": "uuid",
  "templateId": "uuid",
  "mobile": "+919900000001",
  "templateData": {
    "customerName": "Rohan"
  },
  "ctaLink": "https://custva.in/offer",
  "attempt": 1,
  "traceId": "uuid"
}
```

### Message status reconcile job

Queue: `message_status_reconcile_queue`

```json
{
  "jobType": "message.reconcile",
  "messageId": "uuid",
  "merchantId": "uuid",
  "provider": "cloud_api",
  "providerMessageId": "wamid....",
  "campaignId": "uuid",
  "traceId": "uuid"
}
```

### Analytics projection job

Queue: `analytics_projection_queue`

```json
{
  "jobType": "analytics.project",
  "merchantId": "uuid",
  "campaignId": "uuid",
  "messageId": "uuid",
  "eventType": "delivered",
  "eventAt": "2026-05-28T12:00:00Z",
  "traceId": "uuid"
}
```

## Dispatch flow

1. API validates campaign/template/audience inputs.
2. Audience resolver returns deduplicated customer IDs.
3. API writes `campaign_audiences` snapshot and initial campaign counters.
4. API enqueues one `campaign.dispatch` job per recipient in batched inserts.
5. Worker sends message via provider adapter, writes `messages` row, and updates counters.
6. Worker schedules a delayed reconcile job (for example +10 minutes) for unconfirmed statuses.

## Webhook and reconciliation flow

1. Provider webhook hits `/webhooks/whatsapp`.
2. API validates signature and parses provider payload.
3. System writes immutable `message_events`.
4. System updates latest state in `messages`.
5. System enqueues `analytics.project` jobs.
6. Reconcile worker checks stale `sent`/`queued` messages and backfills status when possible.

## Retry strategy

- Dispatch retry policy:
  - attempts: 5
  - backoff: exponential (base 2s, max delay 5m)
  - jitter: enabled to reduce thundering herd
- Non-retriable errors:
  - invalid phone number
  - template rejected by provider
  - merchant suspended
- Retriable errors:
  - provider 5xx
  - network timeout
  - temporary rate limit
- Exhausted jobs move to `dead_letter_queue` with enriched failure context.

## Idempotency and deduplication

- Dispatch job id key: `campaignId:customerId`.
- Provider callbacks deduplicated by `provider_message_id + event_type + event_at`.
- Message updates only apply monotonic status transitions:
  - `queued -> sent -> delivered -> read`
  - `failed` is terminal unless manual replay is triggered.

## Analytics projection logic

- Trigger projection on `delivered`, `read`, and conversion events.
- Projection updates:
  - campaign sent/delivered/read/failed counters
  - `daily_merchant_metrics` fields for revenue and conversion
  - retention input aggregates based on visit/re-engagement criteria
- Projection jobs are idempotent by event UUID.

## Operational controls

- Worker concurrency configurable per queue.
- Circuit breaker around provider adapter on repeated failures.
- Queue dashboard metrics:
  - depth
  - throughput
  - failure ratio
  - oldest job age
- Alert thresholds:
  - dead letter growth spike
  - webhook processing lag
  - reconcile backlog beyond SLA
