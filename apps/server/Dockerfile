# syntax=docker/dockerfile:1.7

FROM oven/bun:latest AS base
WORKDIR /app

FROM base AS deps
COPY bun.lock bun.lock
COPY bunfig.toml bunfig.toml
COPY package.json package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN bun install --ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY . .
RUN bun run --filter server build

FROM base AS production-deps
COPY bun.lock bun.lock
COPY bunfig.toml bunfig.toml
COPY package.json package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN bun install --ci

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/bunfig.toml ./bunfig.toml
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/next.config.ts ./apps/server/next.config.ts
COPY --from=builder /app/apps/server/drizzle.config.ts ./apps/server/drizzle.config.ts
COPY --from=builder /app/apps/server/postcss.config.mjs ./apps/server/postcss.config.mjs
COPY --from=builder /app/apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY --from=builder /app/apps/server/components.json ./apps/server/components.json
COPY --from=builder /app/apps/server/public ./apps/server/public
COPY --from=builder /app/apps/server/.next ./apps/server/.next
COPY --from=builder /app/apps/server/src/db ./apps/server/src/db

EXPOSE 3000
CMD ["bun", "run", "--filter", "server", "start"]
