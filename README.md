# Custva

Custva is a customer retention and WhatsApp engagement platform for offline businesses.

## Repository structure

- `apps/web-merchant` - Merchant dashboard (Next.js)
- `apps/web-admin` - Admin dashboard (Next.js)
- `apps/api` - Express.js API service
- `apps/worker` - BullMQ workers
- `packages/shared` - Shared contracts and schemas
- `packages/whatsapp-adapters` - Provider adapter abstractions
- `docs` - Product and technical blueprint documents
- `infra` - Deployment and infrastructure assets
- `scripts` - Operational automation scripts

## Blueprint docs

- `docs/architecture.md`
- `docs/data-model.md`
- `docs/api-contracts.md`
- `docs/queue-messaging.md`
- `docs/mvp-delivery-plan.md`
- `docs/engineering-standards.md`

## Run locally

1. `corepack pnpm install`
2. `docker compose -f infra/docker-compose.yml up -d postgres redis`
3. `corepack pnpm db:migrate`
4. `corepack pnpm db:seed`
5. `corepack pnpm dev:api`
6. `corepack pnpm dev:worker`
7. `corepack pnpm dev:web-merchant`
8. `corepack pnpm dev:web-admin`

## Demo credentials

- Merchant user: `demo@custva.local` / create via `POST /api/v1/auth/register`
- Platform admin: `admin@custva.local` / password from `CUSTVA_PLATFORM_ADMIN_PASSWORD` (`Admin@123` by default)
