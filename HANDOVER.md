# Custva handover guide

Custva is an **MVP** monorepo for cafe customer retention and WhatsApp engagement. This document is the entry point for a senior developer taking over.

## Architecture

| Piece | Path | Role |
|-------|------|------|
| Merchant UI | `apps/web-merchant` | Next.js 14 (port 3000) — dashboard, customers, campaigns, templates, profile |
| Admin UI | `apps/web-admin` | Next.js 14 (port 3001) — merchants, global templates, analytics |
| API | `apps/api` | Express `/api/v1` — auth, CRM, campaigns, templates, admin, WhatsApp webhooks |
| Worker | `apps/worker` | BullMQ — campaign dispatch, lifecycle WhatsApp, analytics projection |
| Shared | `packages/shared` | DTOs, Bull job ID helpers |
| WA adapter | `packages/whatsapp-adapters` | Meta Cloud API client |
| Infra | `infra/` | Docker Compose (Postgres + Redis), SQL migrations |
| Scripts | `scripts/` | migrate, seed-demo, seed-lifecycle |

**Intended deploy:** Vercel for frontends (`Root Directory` = `apps/web-merchant` or `apps/web-admin`); containerized API + worker; managed Postgres + Redis.

## Local runbook

1. `corepack pnpm install`
2. `docker compose -f infra/docker-compose.yml up -d postgres redis`
3. Copy `.env.example` → `.env` and set strong secrets (never leave placeholders in shared envs)
4. Copy `apps/web-merchant/.env.local.example` → `apps/web-merchant/.env.local`
5. Copy `apps/web-admin/.env.local.example` → `apps/web-admin/.env.local`
6. `corepack pnpm db:migrate`
7. Set `ADMIN_PASSWORD` (or `CUSTVA_PLATFORM_ADMIN_PASSWORD`) then `corepack pnpm db:seed`
8. Optionally `corepack pnpm db:seed-lifecycle` to fork lifecycle templates to a merchant
9. Start: `dev:api`, `dev:worker`, `dev:web-merchant`, `dev:web-admin`

## Environment matrix

### Root `.env` (API + worker + scripts)

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | yes | Use `production` in deployed envs |
| `DATABASE_URL` | yes | Postgres |
| `REDIS_URL` | yes | BullMQ |
| `JWT_ACCESS_SECRET` | yes | Min 32 chars in production |
| `JWT_REFRESH_SECRET` | yes | Min 32 chars in production |
| `CORS_ORIGINS` | prod | Comma-separated merchant + admin origins |
| `WA_PHONE_NUMBER_ID` | prod | Required when `NODE_ENV=production` |
| `WA_ACCESS_TOKEN` | prod | Required when `NODE_ENV=production` |
| `WA_APP_SECRET` | prod | Meta app secret for webhook HMAC |
| `WA_WEBHOOK_VERIFY_TOKEN` | yes for WA | Subscribe challenge |
| `WA_MERCHANT_DAILY_CAP` | no | Default 500 |
| `WA_PLATFORM_DAILY_CAP` | no | Default 100000 |
| `CUSTVA_DEV_MERCHANT_ID` | **local only** | Enables `x-dev-merchant-id` bypass when not production |
| `ADMIN_PASSWORD` | seed | Required for `db:seed`; refuse default in production |

### Merchant / admin `.env.local`

| Variable | App | Notes |
|----------|-----|-------|
| `CUSTVA_API_BASE_URL` | both | e.g. `https://api.example.com/api/v1` |
| `OTP_JWT_SECRET` | merchant | Required in production |
| `ADMIN_OTP_JWT_SECRET` | admin | Required in production |
| `SMTP_*` | both | OTP email delivery |
| `CUSTVA_DEV_MERCHANT_ID` | merchant | **Local only** — never set in Vercel production |

## Demo IDs (local)

- Platform merchant: `00000000-0000-0000-0000-000000000001`
- Demo merchant: `00000000-0000-0000-0000-000000000010`
- Platform admin email: `admin@custva.local` (password from env)

## What works (MVP)

- Multi-tenant merchants, JWT + OTP login
- Customers / visits, campaigns, analytics export
- Global templates (admin) + merchant forks
- Lifecycle WhatsApp journeys (visit tiers × Day 0/3/7/14) via BullMQ
- Admin merchant onboarding and template assign/push

## Production gaps already addressed in code

- Fail-closed auth (no `x-dev-merchant-id` in production)
- Strong JWT / OTP secrets required in production
- CORS allowlist via `CORS_ORIGINS`
- WhatsApp webhook `X-Hub-Signature-256` verification
- Migration tracking (`schema_migrations`) so re-runs do not re-archive templates
- Worker refuses to start in production without WA credentials
- `/health/ready` probes Postgres + Redis
- Auth route rate limiting
- Seed refuses default `Admin@123` when `NODE_ENV=production`

## Still open / next sprint

- CSRF hardening for cookie BFF
- Wire Sentry + structured pino logging (deps present, unused)
- Postgres backup/restore runbook
- Real automated tests (CI lint/test are mostly stubs today)
- Meta-approved template names + real header image URLs
- Email verification after `POST /auth/register` (`verificationRequired` is cosmetic)

## Docs vs code

Prefer `docs/data-model.md`, `docs/api-contracts.md`, `docs/queue-messaging.md` for current behavior. Treat `docs/architecture.md` and `docs/engineering-standards.md` as aspirational where they mention Sentry, DLQ dashboards, or layered modules that are not wired.

## Safety before sharing the repo

1. Do not zip or commit `.env` / `*.env.local`
2. Rotate JWT/OTP/SMTP secrets that lived on this machine
3. Never run `db:seed` against a production database with a weak password
