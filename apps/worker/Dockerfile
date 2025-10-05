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

FROM base AS production-deps
COPY bun.lock bun.lock
COPY bunfig.toml bunfig.toml
COPY package.json package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN bun install --ci

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY bun.lock bun.lock
COPY bunfig.toml bunfig.toml
COPY package.json package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/worker ./apps/worker
CMD ["bun", "run", "--filter", "worker", "start"]
