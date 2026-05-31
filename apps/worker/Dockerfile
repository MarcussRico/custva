FROM node:22-alpine AS base
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/whatsapp-adapters/package.json packages/whatsapp-adapters/

RUN corepack enable && corepack pnpm install --frozen-lockfile=false

COPY . .
RUN corepack pnpm --filter @custva/whatsapp-adapters build && \
    corepack pnpm --filter @custva/worker build

CMD ["node", "apps/worker/dist/index.js"]
