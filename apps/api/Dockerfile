FROM node:22-alpine AS base
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/whatsapp-adapters/package.json packages/whatsapp-adapters/

RUN corepack enable && corepack pnpm install --frozen-lockfile=false

COPY . .
RUN corepack pnpm --filter @custva/shared build && \
    corepack pnpm --filter @custva/whatsapp-adapters build && \
    corepack pnpm --filter @custva/api build

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
