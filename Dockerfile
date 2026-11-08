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
CMD ["node", "server.js"]
