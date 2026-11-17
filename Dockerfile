# syntax=docker/dockerfile:1
# Multi-stage сборка Next.js с output: "standalone" (SPEC §10.2).

ARG NODE_VERSION=24-alpine

# 0. Общая база с pnpm
FROM node:${NODE_VERSION} AS base
WORKDIR /app
RUN npm install -g --no-audit --no-fund pnpm@12.18.0

# 1. Зависимости
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# 2. Сборка
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# 2b. Инструменты: миграции, сид, ночной пересев (tsx, полный node_modules). В бою не работает постоянно:
#     запускается разово через docker compose run (deploy/docker-compose.prod.yml, профиль tools).
FROM base AS tools
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY db ./db
COPY content ./content
COPY scripts ./scripts
COPY config ./config
COPY src ./src
USER node
CMD ["node_modules/.bin/tsx", "db/migrate.ts"]

# 3. Рантайм: только server.js, минимальный node_modules и статика
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
