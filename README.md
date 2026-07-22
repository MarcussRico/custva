# Custva

**Customer retention and WhatsApp engagement platform for offline cafes and local businesses.**

Custva helps merchants capture walk-in customers, track visits and spend, run WhatsApp campaigns, and automate lifecycle messaging after each visit. Platform admins onboard merchants, manage global WhatsApp templates, and monitor the network.

| | |
|---|---|
| **Status** | MVP — feature-complete for cafe retention; production hardening in progress |
| **Monorepo** | pnpm workspaces (`apps/*`, `packages/*`) |
| **Stack** | Next.js 14 · Express · PostgreSQL · Redis · BullMQ · Meta WhatsApp Cloud API |
| **Package manager** | `pnpm@10.8.1` via Corepack |

> **Incoming engineers:** also read [`HANDOVER.md`](HANDOVER.md) for env matrix, demo IDs, and known gaps.

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [System architecture](#2-system-architecture)
3. [Repository map](#3-repository-map)
4. [Prerequisites](#4-prerequisites)
5. [Local development setup](#5-local-development-setup)
6. [Environment variables](#6-environment-variables)
7. [Applications in detail](#7-applications-in-detail)
8. [API surface](#8-api-surface)
9. [Authentication & authorization](#9-authentication--authorization)
10. [Data model & migrations](#10-data-model--migrations)
11. [Queues & WhatsApp messaging](#11-queues--whatsapp-messaging)
12. [Lifecycle journeys](#12-lifecycle-journeys)
13. [Scripts & tooling](#13-scripts--tooling)
14. [Deployment](#14-deployment)
15. [Security checklist](#15-security-checklist)
16. [Health, observability & CI](#16-health-observability--ci)
17. [Documentation index](#17-documentation-index)
18. [Known limitations & roadmap](#18-known-limitations--roadmap)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. Product overview

### Who it serves

| Persona | App | Primary jobs |
|---------|-----|----------------|
| **Cafe merchant / staff** | `web-merchant` | Log visits, manage customers, edit lifecycle copy, run campaigns, view analytics |
| **Platform admin** | `web-admin` | Onboard merchants, create/assign global templates, push updates, view platform metrics |

### Core capabilities

- **POS-style visit capture** — name, mobile, spend; creates/updates customer and records visit
- **Customer CRM** — filters, detail view, retention revenue tracking
- **WhatsApp templates** — Meta-style header / body / footer / buttons / header image
- **Lifecycle automation** — 4 visit tiers × Day 0 / 3 / 7 / 14 scheduled messages
- **Campaigns** — audience filters + batch dispatch via BullMQ
- **Admin template governance** — global catalog, assign/fork to merchants, push version updates
- **OTP email login** — merchant and admin session cookies (httpOnly JWT)

### Local URLs (default)

| Service | URL |
|---------|-----|
| Merchant app | http://localhost:3000 |
| Admin app | http://localhost:3001 |
| API | http://localhost:4000 |
| API live health | http://localhost:4000/health/live |
| API ready health | http://localhost:4000/health/ready |
| Postgres | `localhost:5432` |
| Redis | `localhost:6379` |

---

## 2. System architecture

```text
┌─────────────────────┐     ┌─────────────────────┐
│  web-merchant       │     │  web-admin          │
│  Next.js :3000      │     │  Next.js :3001      │
│  BFF + cookies      │     │  BFF + cookies      │
└─────────┬───────────┘     └─────────┬───────────┘
          │  Bearer JWT               │  Bearer JWT
          └────────────┬──────────────┘
                       ▼
              ┌────────────────┐
              │  apps/api      │
              │  Express :4000 │
              │  /api/v1/*     │
              └───────┬────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
   PostgreSQL      Redis       Meta WhatsApp
   (source of      (BullMQ)    (webhooks in,
    truth)                      Cloud API out)
                      │
                      ▼
              ┌────────────────┐
              │  apps/worker   │
              │  campaign +    │
              │  lifecycle +   │
              │  analytics     │
              └────────────────┘
```

**Design principles**

- Frontends never talk to Postgres/Redis directly; they call the API (often via Next.js route handlers as a BFF).
- Long-running WhatsApp work is **async** (enqueue from API → worker consumes).
- Merchants are multi-tenant; almost every row is scoped by `merchant_id`.
- Global templates (`is_global = true`) are owned by the platform and forked to merchants on assign.

---

## 3. Repository map

```text
custva/
├── apps/
│   ├── api/                 # Express REST API (@custva/api)
│   ├── worker/              # BullMQ workers (@custva/worker)
│   ├── web-merchant/        # Merchant Next.js app (@custva/web-merchant)
│   └── web-admin/           # Platform admin Next.js app (@custva/web-admin)
├── packages/
│   ├── shared/              # Shared types, brand tokens, Bull job ID helpers
│   └── whatsapp-adapters/   # Meta Cloud API adapter
├── infra/
│   ├── docker-compose.yml   # postgres + redis (+ optional api/worker images)
│   └── db/migrations/       # Ordered SQL migrations (0001–0012+)
├── scripts/
│   ├── run-migrations.mjs   # Idempotent migration runner (schema_migrations)
│   ├── seed-demo.mjs        # Platform admin bootstrap
│   └── seed-lifecycle-templates.mjs
├── docs/                    # Architecture & contracts (see §17)
├── .github/workflows/ci.yml
├── .env.example             # Root env template (API / worker / scripts)
├── HANDOVER.md              # Senior takeover notes
├── package.json             # Workspace scripts
└── pnpm-workspace.yaml
```

| Package | Name | Role |
|---------|------|------|
| `apps/api` | `@custva/api` | Auth, CRM, campaigns, templates, admin, webhooks |
| `apps/worker` | `@custva/worker` | Queue consumers; WhatsApp send |
| `apps/web-merchant` | `@custva/web-merchant` | Merchant UI + session BFF |
| `apps/web-admin` | `@custva/web-admin` | Admin UI + session BFF |
| `packages/shared` | `@custva/shared` | DTOs, `lifecycleBullJobId`, `campaignBatchBullJobId` |
| `packages/whatsapp-adapters` | `@custva/whatsapp-adapters` | Cloud API send with template components |

---

## 4. Prerequisites

- **Node.js** 20+ (CI uses 22)
- **Corepack** enabled (`corepack enable`)
- **pnpm** 10.8.1 (pinned via `packageManager` in root `package.json`)
- **Docker Desktop** (Postgres 16 + Redis 7)
- Optional: Meta WhatsApp Cloud API credentials for real sends
- Optional: SMTP credentials for OTP email (Nodemailer)

---

## 5. Local development setup

### 5.1 Install dependencies

```bash
corepack enable
corepack pnpm install
```

### 5.2 Start infrastructure

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
```

### 5.3 Configure environment

```bash
# Root (API, worker, scripts)
cp .env.example .env
# Edit .env — set JWT secrets, ADMIN_PASSWORD, CORS_ORIGINS

# Merchant
cp apps/web-merchant/.env.local.example apps/web-merchant/.env.local

# Admin
cp apps/web-admin/.env.local.example apps/web-admin/.env.local
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5.4 Migrate and seed

```bash
corepack pnpm db:migrate
# Requires ADMIN_PASSWORD or CUSTVA_PLATFORM_ADMIN_PASSWORD in .env
corepack pnpm db:seed
# Optional: fork lifecycle templates to merchants
corepack pnpm db:seed-lifecycle
```

Migrations are **tracked** in `schema_migrations`. Re-running `db:migrate` skips already-applied files. Existing databases without tracking are bootstrapped once (all current files marked applied).

### 5.5 Start all services

Open four terminals (or use your process manager):

```bash
corepack pnpm dev:api
corepack pnpm dev:worker
corepack pnpm dev:web-merchant
corepack pnpm dev:web-admin
```

Or start everything in parallel (noisy):

```bash
corepack pnpm dev
```

### 5.6 Verify

```bash
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
# → { "ok": true, "checks": { "postgres": "ok", "redis": "ok" } }
```

### Demo access

| Role | How |
|------|-----|
| Platform admin | Email `admin@custva.local` (or `ADMIN_EMAIL`), password from `ADMIN_PASSWORD` |
| Merchant | Register via UI / `POST /api/v1/auth/register`, then OTP login |

**Never** seed production with a weak password. `db:seed` refuses `Admin@123` when `NODE_ENV=production`.

---

## 6. Environment variables

### 6.1 Root `.env` (API + worker + scripts)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | yes | `development` locally; **`production` in deploy** |
| `PORT` | no | API port (default `4000`) |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `REDIS_URL` | yes | Redis URL for BullMQ |
| `JWT_ACCESS_SECRET` | yes | Access token secret (**≥ 32 chars in production**) |
| `JWT_REFRESH_SECRET` | yes | Refresh token secret (**≥ 32 chars in production**) |
| `CORS_ORIGINS` | **prod** | Comma-separated allowed browser origins |
| `WA_PHONE_NUMBER_ID` | **prod** | Meta phone number ID |
| `WA_ACCESS_TOKEN` | **prod** | Meta permanent/system user token |
| `WA_APP_SECRET` | **prod** | Meta app secret — webhook HMAC |
| `WA_WEBHOOK_VERIFY_TOKEN` | for WA | Subscribe challenge token |
| `WA_MERCHANT_DAILY_CAP` | no | Per-merchant daily send cap (default `500`) |
| `WA_PLATFORM_DAILY_CAP` | no | Platform daily send cap (default `100000`) |
| `CUSTVA_API_BASE_URL` | docs | Typical `http://localhost:4000/api/v1` |
| `CUSTVA_DEV_MERCHANT_ID` | **local only** | Enables `x-dev-merchant-id` bypass when not production |
| `CUSTVA_PLATFORM_MERCHANT_ID` | seed | Default platform merchant UUID |
| `ADMIN_EMAIL` | seed | Default `admin@custva.local` |
| `ADMIN_PASSWORD` / `CUSTVA_PLATFORM_ADMIN_PASSWORD` | seed | **Required** for `db:seed` |

In production the API **does not** load `.env.example` as a fallback. Missing strong secrets or `CORS_ORIGINS` / `WA_APP_SECRET` will fail boot.

### 6.2 Merchant `apps/web-merchant/.env.local`

| Variable | Required | Description |
|----------|----------|-------------|
| `CUSTVA_API_BASE_URL` | yes | API base including `/api/v1` |
| `OTP_JWT_SECRET` | **prod** | Signs OTP pending cookies |
| `SMTP_HOST` / `PORT` / `USER` / `PASS` | for OTP email | Nodemailer |
| `CUSTVA_DEV_MERCHANT_ID` | local only | **Do not set on Vercel production** |

### 6.3 Admin `apps/web-admin/.env.local`

| Variable | Required | Description |
|----------|----------|-------------|
| `CUSTVA_API_BASE_URL` | yes | API base including `/api/v1` |
| `ADMIN_OTP_JWT_SECRET` | **prod** | Signs admin OTP cookies |
| `SMTP_*` | for OTP email | Nodemailer |
| `CUSTVA_DEV_MERCHANT_ID` | local only | **Do not set on Vercel production** |

---

## 7. Applications in detail

### 7.1 Merchant app (`apps/web-merchant`)

| Route | Purpose |
|-------|---------|
| `/` | Marketing landing |
| `/login` | Email + password → OTP → session cookies |
| `/dashboard` | KPIs, quick visit entry |
| `/customers` | Search/filter list |
| `/customers/[id]` | Customer detail |
| `/templates` | Lifecycle templates (grouped) + custom create |
| `/campaigns` | Create / send campaigns |
| `/analytics` | Charts + CSV export |
| `/profile` | Shop profile, password change |

**Auth flow:** login API → email OTP (SMTP) → httpOnly cookies (`custva_merchant_access_token`, refresh). Server components and route handlers proxy to the API with `Authorization: Bearer …`.

### 7.2 Admin app (`apps/web-admin`)

| Route | Purpose |
|-------|---------|
| `/` | Landing / redirect |
| `/login` | Platform admin OTP login |
| `/dashboard` | Platform analytics |
| `/merchants` | List, onboard, edit merchants |
| `/templates` | Global template CRUD, assign, push updates |

### 7.3 API (`apps/api`)

- Express + Helmet + CORS allowlist + Zod validation
- Auth rate limit: **30 requests / 15 minutes** on `/api/v1/auth`
- Structured error envelope via `lib/api-response.ts`
- Modules under `src/modules/{auth,customers,campaigns,templates,merchants,analytics,admin,webhooks}`

### 7.4 Worker (`apps/worker`)

Consumes:

- `campaign_dispatch_queue`
- `lifecycle_dispatch_queue`
- `analytics_projection_queue`

In **production**, the worker **exits on boot** if `WA_PHONE_NUMBER_ID` or `WA_ACCESS_TOKEN` is missing (no silent mock sends). Locally, missing WA creds → mock mode with `mock-{uuid}` provider IDs.

### 7.5 Shared packages

- **`@custva/shared`** — API DTO shapes, brand tokens, BullMQ-safe job IDs (`lifecycle-{scheduleId}`, `campaign-{id}-batch-{n}`). Custom BullMQ job IDs **must not contain `:`**.
- **`@custva/whatsapp-adapters`** — builds Meta template components (image/text header, body vars, URL buttons).

---

## 8. API surface

Base path: **`/api/v1`**

| Mount | Auth | Responsibility |
|-------|------|----------------|
| `/auth` | Public (rate-limited) | Register, login, refresh |
| `/webhooks` | Signature / verify token | Meta WhatsApp webhooks |
| `/customers` | Bearer | CRM + visits (triggers lifecycle enroll) |
| `/campaigns` | Bearer | Campaign CRUD, audience, send |
| `/templates` | Bearer | Merchant templates |
| `/merchants` | Bearer | Merchant self profile |
| `/analytics` | Bearer | Dashboard metrics, export |
| `/admin` | Bearer + `platform_admin` | Merchants, global templates, audit, jobs |

### Health (no `/api/v1` prefix)

| Endpoint | Behavior |
|----------|----------|
| `GET /health/live` | Process up → `{ ok: true }` |
| `GET /health/ready` | Probes Postgres + Redis → `200` or `503` with `{ checks }` |

Detailed request/response contracts: [`docs/api-contracts.md`](docs/api-contracts.md).

### WhatsApp webhooks

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/v1/webhooks/whatsapp` | Hub challenge; matches `WA_WEBHOOK_VERIFY_TOKEN` |
| `POST` | `/api/v1/webhooks/whatsapp` | Status callbacks; verifies `X-Hub-Signature-256` with `WA_APP_SECRET` (required in production) |

---

## 9. Authentication & authorization

### Roles

| Role | Scope |
|------|--------|
| `merchant_admin` | Full merchant tenant |
| `merchant_staff` | Merchant tenant (staff) |
| `platform_admin` | Cross-merchant admin APIs |

### Tokens

- **Access JWT** — short-lived; signed with `JWT_ACCESS_SECRET`
- **Refresh JWT** — stored hashed server-side; rotatable
- **OTP pending JWT** — httpOnly cookie during email OTP (separate secrets per app)

### Dev bypass (local only)

When `NODE_ENV !== "production"` **and** `CUSTVA_DEV_MERCHANT_ID` is set, the API may accept:

```http
x-dev-merchant-id: <uuid>
x-dev-role: platform_admin   # optional; admin client only
```

This is **disabled in production**. Never set `CUSTVA_DEV_MERCHANT_ID` on Vercel production projects.

---

## 10. Data model & migrations

### Key entities

| Table / concept | Purpose |
|-----------------|---------|
| `merchants` | Tenant shops |
| `users` | Login accounts + roles |
| `customers` | End customers per merchant |
| `visits` / spend fields | Visit history, retention revenue |
| `templates` | Global + merchant WhatsApp templates |
| `campaigns` / `messages` / `message_events` | Outbound messaging |
| `lifecycle_schedules` | Pending/cancelled/sent lifecycle jobs |
| `daily_merchant_metrics` | Aggregated analytics |
| `admin_audit_logs` / `admin_bulk_jobs` | Admin ops |
| `schema_migrations` | Applied migration filenames |

Full schema notes: [`docs/data-model.md`](docs/data-model.md).

### Migration files (`infra/db/migrations/`)

| File | Theme |
|------|--------|
| `0001_init.sql` | Core merchants, users, customers |
| `0002_campaigns_messages.sql` | Campaigns & messages |
| `0003_subscriptions.sql` | Plans / subscription fields |
| `0004_auth_events.sql` | Auth event logging |
| `0005_merchant_onboarding.sql` | Onboarding fields |
| `0006_global_templates.sql` | Global template forking |
| `0007_admin_audit_logs.sql` | Audit + bulk jobs |
| `0008_merchant_crm.sql` | CRM enhancements |
| `0009_retention_revenue.sql` | Retention revenue flags |
| `0010_lifecycle_templates.sql` | Lifecycle catalog (one-shot archive + seed) |
| `0011_lifecycle_schedules.sql` | Schedule table + customer tier |
| `0012_lifecycle_bull_job_ids.sql` | Rewrite `lifecycle:` → `lifecycle-` job IDs |

Apply with:

```bash
corepack pnpm db:migrate
```

---

## 11. Queues & WhatsApp messaging

### Queues in use

| Queue | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `campaign_dispatch_queue` | API (campaign send) | Worker | Batched campaign recipients |
| `lifecycle_dispatch_queue` | API (after visit) | Worker | Delayed Day 0/3/7/14 sends |
| `analytics_projection_queue` | Worker / events | Worker | Metric projections |

Job ID helpers live in `@custva/shared` (no `:` characters — BullMQ requirement).

### Send path

1. API or lifecycle enroll writes schedule / campaign state.
2. Job enqueued with delay (lifecycle) or immediate batch (campaign).
3. Worker loads template + customer + shop, builds Meta components.
4. Adapter calls Cloud API (or mock locally).
5. Webhook POST updates `messages` status and metrics.

Caps: `WA_MERCHANT_DAILY_CAP`, `WA_PLATFORM_DAILY_CAP`.

More detail: [`docs/queue-messaging.md`](docs/queue-messaging.md) (note: some DLQ names in docs are aspirational — see §18).

---

## 12. Lifecycle journeys

On each qualifying customer visit (WhatsApp opt-in):

1. Compute visit tier (1–4) → `first_visit` … `fourth_visit`
2. Cancel pending schedules + remove BullMQ jobs for that customer
3. Schedule up to four milestones for that tier:

| Milestone | Delay from visit |
|-----------|------------------|
| Day 0 | +5 minutes |
| Day 3 | +3 days |
| Day 7 | +7 days |
| Day 14 | +14 days |

4. Worker reconciler re-enqueues overdue `pending` schedules every 15 minutes

**Body variables:** `{{name}}`, `{{shop_name}}` (and related) resolved at send time.

Merchants edit **copy** of forked templates; platform owns the global catalog and Meta template names.

---

## 13. Scripts & tooling

| Command | What it does |
|---------|----------------|
| `corepack pnpm install` | Install all workspaces |
| `corepack pnpm dev:api` | API watch mode |
| `corepack pnpm dev:worker` | Worker watch mode |
| `corepack pnpm dev:web-merchant` | Merchant Next.js `:3000` |
| `corepack pnpm dev:web-admin` | Admin Next.js `:3001` |
| `corepack pnpm typecheck` | `tsc` across packages |
| `corepack pnpm build` | Build all packages that define `build` |
| `corepack pnpm lint` | Per-package lint (many are stubs today) |
| `corepack pnpm test` | Per-package test (stubs today) |
| `corepack pnpm db:migrate` | Apply pending SQL migrations |
| `corepack pnpm db:seed` | Seed platform admin user |
| `corepack pnpm db:seed-lifecycle` | Fork lifecycle templates to merchants |

---

## 14. Deployment

### Recommended topology

| Component | Suggested host |
|-----------|----------------|
| `web-merchant` | Vercel — **Root Directory** `apps/web-merchant` |
| `web-admin` | Vercel — **Root Directory** `apps/web-admin` |
| `api` | Container / VM / Railway / Render / ECS |
| `worker` | Same as API (separate process/container) |
| Postgres | Managed (RDS, Neon, Supabase, etc.) |
| Redis | Managed (ElastiCache, Upstash, Redis Cloud) |

### Vercel notes

1. Connect the **monorepo root**, not a subfolder-only repo.
2. Set Root Directory to `apps/web-merchant` or `apps/web-admin`.
3. Enable including files outside the root so `@custva/shared` installs.
4. Set `NODE_ENV=production`.
5. Set `CUSTVA_API_BASE_URL` to the public API URL.
6. Set OTP + SMTP secrets; **omit** `CUSTVA_DEV_MERCHANT_ID`.

### API / worker containers

- Dockerfiles: `apps/api/Dockerfile`, `apps/worker/Dockerfile`
- Root [`.dockerignore`](.dockerignore) excludes `.env`, `node_modules`, `.next`, etc.
- Compose file under `infra/` is for **local** use; do not ship with `env_file: .env.example` in production.
- Set `NODE_ENV=production`, real secrets, `CORS_ORIGINS`, WA credentials, `WA_APP_SECRET`.

### Production boot gates (enforced in code)

- JWT secrets ≥ 32 characters
- `CORS_ORIGINS` required
- `WA_APP_SECRET` required (API)
- WA phone ID + access token required (worker)
- OTP secrets required in Next apps
- No `.env.example` fallback load
- No `x-dev-merchant-id` auth bypass

---

## 15. Security checklist

Before any shared or production environment:

- [ ] Rotate all JWT, OTP, SMTP, and WA tokens used on developer machines
- [ ] Confirm `.env` / `.env.local` are **not** in git or zip archives
- [ ] `NODE_ENV=production` on API, worker, and frontends
- [ ] `CORS_ORIGINS` lists only real merchant/admin domains
- [ ] Meta webhook URL points to API; verify token + app secret configured
- [ ] Strong `ADMIN_PASSWORD`; never use `Admin@123` in shared DBs
- [ ] `CUSTVA_DEV_MERCHANT_ID` unset in production
- [ ] Auth rate limits active (shipped on `/api/v1/auth`)
- [ ] Ready probe used by load balancer / orchestrator

Still recommended (not fully shipped): CSRF strategy for cookie BFF, Sentry, structured logging, automated security tests.

---

## 16. Health, observability & CI

### Health

```bash
curl -s http://localhost:4000/health/live
curl -s http://localhost:4000/health/ready
```

### Logging

Today: `console` logging on API/worker. `pino` / `pino-http` are dependencies but not fully wired. `SENTRY_DSN` is not read yet.

### CI (`.github/workflows/ci.yml`)

On push/PR to `main` / `master`:

1. Install (pnpm)
2. Lint
3. Typecheck
4. Test
5. Build

**Note:** many package `lint` / `test` scripts are placeholders. Treat **typecheck** as the primary automated gate until real tests exist.

---

## 17. Documentation index

| Document | Use when |
|----------|----------|
| [`HANDOVER.md`](HANDOVER.md) | Taking ownership; env matrix; gaps |
| [`docs/data-model.md`](docs/data-model.md) | Schema & entity relationships |
| [`docs/api-contracts.md`](docs/api-contracts.md) | Endpoint contracts |
| [`docs/queue-messaging.md`](docs/queue-messaging.md) | Queue topology & job payloads |
| [`docs/architecture.md`](docs/architecture.md) | Target architecture (some aspirational) |
| [`docs/engineering-standards.md`](docs/engineering-standards.md) | Coding standards (aspirational vs current) |
| [`docs/mvp-delivery-plan.md`](docs/mvp-delivery-plan.md) | Historical MVP milestones |

Prefer **data-model / api-contracts / queue-messaging / HANDOVER** over older architecture claims about Sentry, DLQ dashboards, or unused modules.

---

## 18. Known limitations & roadmap

### Shipped hardening

- Fail-closed auth in production
- CORS allowlist
- Webhook HMAC verification
- Migration tracking (no destructive re-apply of lifecycle archive)
- Worker hard-fail without WA in production
- `/health/ready` with Postgres + Redis
- Auth rate limiting
- Seed password requirements

### Next (recommended)

- CSRF protection for cookie-based BFF
- Wire Sentry + structured pino logging
- Real unit/integration tests (auth, webhook, lifecycle)
- Postgres backup/restore runbook
- Meta-approved template names + production header images
- Email verification after register (`verificationRequired` is currently cosmetic)
- Replace echo lint/test stubs in CI

---

## 19. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| API crash: `Custom Id cannot contain :` | Old Bull job IDs | Ensure `@custva/shared` helpers + migration `0012` applied |
| API: invalid env / CORS | Missing prod vars | Set `CORS_ORIGINS`, long JWT secrets |
| Worker exits immediately in prod | Missing WA creds | Set `WA_PHONE_NUMBER_ID` + `WA_ACCESS_TOKEN` |
| `/health/ready` → 503 | Postgres/Redis down | `docker compose … up -d postgres redis` |
| `db:seed` fails | No password | Set `ADMIN_PASSWORD` in `.env` |
| Templates vanish after migrate | Old runner re-applied `0010` | Use current `run-migrations.mjs` with `schema_migrations` |
| Frontend 401s in prod | Dev header unset / no cookie | Login again; do not rely on `CUSTVA_DEV_MERCHANT_ID` |
| OTP emails not sending | SMTP misconfigured | Check `SMTP_*` in app `.env.local` |
| Webhook rejected | Bad signature | Set `WA_APP_SECRET`; ensure raw body HMAC |
| Redis `ECONNREFUSED` | Redis not published | Recreate Redis container with port `6379` |

---

## License & ownership

Private startup codebase. Do not publish secrets, Meta tokens, or customer data. Coordinate production access and Meta Business verification with the platform owner before go-live.

---

**Maintainer entry points:** [`HANDOVER.md`](HANDOVER.md) · [`docs/`](docs/) · root scripts in `package.json`
