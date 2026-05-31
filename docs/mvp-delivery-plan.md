# Custva MVP Delivery Plan

## Milestone 1: Foundation (Week 1)

### Outcomes

- Monorepo structure finalized.
- Shared coding and runtime standards established.
- Merchant authentication baseline available.

### Work items

- Set up workspace, CI pipeline stages, and base scripts.
- Create config module with environment validation.
- Implement auth endpoints: register/login/refresh/forgot/reset.
- Implement JWT access + refresh token policy.
- Add role-based middleware and tenant guard primitives.

### Validation checkpoints

- Auth integration tests pass.
- All services boot with validated envs.
- Lint/typecheck/test/build are green in CI.

## Milestone 2: Customer Lifecycle (Week 2)

### Outcomes

- Customer data capture and lifecycle management complete.
- Search/filter/sort/pagination ready for merchant dashboard.

### Work items

- Implement `customers` and `customer_visits` schema/migrations.
- Build customer CRUD + list filters + profile endpoint.
- Add CSV export endpoint for filtered results.
- Ensure aggregate recalculation (`total_spend`, `total_visits`, `last_visit`) on visit writes.

### Validation checkpoints

- Query performance validated on indexed paths.
- API contract tests for list filters and edge cases.
- Tenant isolation tests for all customer endpoints.

## Milestone 3: Campaign Builder and Dispatch (Week 3)

### Outcomes

- Merchant can create, schedule, and send campaigns.
- Queue-based async dispatch operational.

### Work items

- Implement templates and campaigns modules.
- Add audience rule engine and campaign audience snapshotting.
- Integrate BullMQ queue and worker dispatch flow.
- Add WhatsApp Cloud API adapter (first provider).

### Validation checkpoints

- Campaign send flow tested end-to-end in sandbox.
- Retry and dead-letter behavior verified with fault injection.
- Delivery counters updated correctly during sends.

## Milestone 4: Webhooks and Analytics (Week 4)

### Outcomes

- Delivery statuses reconcile via webhook + reconcile jobs.
- Merchant dashboard KPIs and trends become available.

### Work items

- Implement webhook endpoint and event normalization.
- Persist `message_events` and project to `daily_merchant_metrics`.
- Implement analytics endpoints (`dashboard`, `retention`, campaign analytics).
- Add chart-ready response formats for frontend consumption.

### Validation checkpoints

- Retention formula verified against fixture data.
- Event idempotency tests pass.
- KPI endpoints meet latency objectives.

## Milestone 5: Admin and Hardening (Week 5)

### Outcomes

- Admin can monitor merchants and platform health.
- System is ready for controlled production rollout.

### Work items

- Implement admin merchant list/status endpoints.
- Add rate limiting and endpoint-specific protections.
- Add Sentry instrumentation and log correlation.
- Finalize backup, migration, and release runbooks.

### Validation checkpoints

- Security test checklist completed.
- Load tests on customers list and analytics endpoints.
- Go-live smoke suite passes.

## Dependency map

1. Foundation gates all subsequent milestones.
2. Customer lifecycle is required before audience segmentation quality.
3. Campaign dispatch requires templates + queue infrastructure.
4. Analytics depends on stable message status and event flow.
5. Admin hardening runs after core merchant journeys are stable.

## Definition of done (MVP)

- Merchant can sign up/login and manage customers.
- Merchant can build audience-targeted campaign and send over WhatsApp.
- Delivery status and campaign performance are visible.
- Retention KPIs and customer trends are available.
- Admin can manage merchant status and monitor high-level platform metrics.
