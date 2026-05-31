# Engineering Standards

## Language and quality

- TypeScript required across `apps/*` and `packages/*`.
- `strict` mode enabled; avoid `any` except narrow integration boundaries.
- ESLint + Prettier enforced in CI and pre-merge checks.
- Keep modules cohesive and bounded by domain.

## Project conventions

- Domain-first backend modules: `modules/<domain>`.
- Use shared DTOs/schemas from `packages/shared`.
- Keep external provider logic in adapter packages, not in domain services.
- All merchant-owned queries must include `merchant_id` scope.

## API conventions

- Versioned routes under `/api/v1`.
- Consistent response/error envelope.
- Request validation at the route boundary.
- Never expose internal error stack traces in API responses.

## Security baseline

- Hash passwords with `argon2` or `bcrypt`.
- Rotate and secure JWT secrets by environment.
- Apply rate limiting on auth and campaign send endpoints.
- Enforce HTTPS in non-local environments.
- Validate webhook signatures for all provider callbacks.

## Data and migrations

- Forward-only SQL migrations.
- No destructive production migration without explicit fallback plan.
- Add indexes for all paginated/filter-heavy queries.
- Use `timestamptz` UTC timestamps for all temporal fields.

## Testing strategy

- Unit tests for domain logic.
- Integration tests for API + repository behavior.
- Contract tests for WhatsApp adapter payload mappings.
- Regression tests for retention and campaign analytics formulas.

## Observability

- Structured logs with request/correlation IDs.
- Sentry instrumentation for API and worker processes.
- Capture queue metrics: depth, retries, failure ratio, latency.
- Define alert thresholds before production launch.

## Delivery and release

- CI required checks: lint, typecheck, test, build.
- Containerized API and worker for deployment parity.
- Release checklist includes:
  - schema migration completed
  - smoke tests on auth/customer/campaign/analytics flows
  - monitoring dashboards healthy
  - rollback instructions validated
