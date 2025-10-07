# Repository Guidelines

## Project Structure & Module Organization

- `apps/server/`: Next.js application that exposes the admin dashboards, provider APIs, and Drizzle ORM schema. UI components live under `src/components`, while TRPC routers and migrations are in `src/routers` and `src/db`.
- `apps/worker/`: Bun-powered IMAP ingestion worker. Entry points are under `src/`, with SQL helpers in `src/db` and mail parsing in `src/utils`.
- Shared documentation sits in `docs/` (e.g., `docs/time-handling.md`). Docker assets and environment templates are at the repository root (`docker-compose.yml`, `.env.example`).

## Build, Test, and Development Commands

- `bun run dev`: Launch all workspace dev servers (Next.js UI, worker watchers, etc.).
- `bun run dev:server`: Start only the server app with Turbopack.
- `bun run --filter worker dev`: Run the worker in watch mode; use `bun run --filter worker dev:test` for the scripted extraction smoke test.
- `bun run db:start|db:stop|db:seed`: Manage the Postgres container and seed baseline providers (proxied to the server workspace scripts).
- `bun run check`: Format + lint with Biome; run before every PR.
- Defore every PR, confirm the server build stays green via `bun run build` (fan-out to `bun run --filter server build`).

## Coding Style & Naming Conventions

- TypeScript everywhere; keep modules ESM (`type: module`). Prefer explicit exports and avoid default exports for shared utilities.
- Format code with Biome (`biome.json`)—tabs for indentation, double quotes in TS, and trailing commas enabled.
- Use descriptive, kebab-case file names (`event-edit-dialog.tsx`) and camelCase for variables/functions. Database slugs should be lower kebab-case; the worker enforces this in `insertEvent`.

## Testing Guidelines

- Automated tests are sparse today; prioritize high-signal integration checks.
- For the worker, run `bun run --filter worker dev:test` against a seeded database to verify extraction + insert paths.
- For the server, rely on manual UI smoke tests plus TRPC route checks with the running Next.js dev server. Add Vitest/Bun tests alongside new modules when practical; name files `*.test.ts` near the code under test.

## Commit & Pull Request Guidelines

- Follow Conventional Commits (`feat:`, `fix:`, `chore:`) as seen in recent history (`git log --oneline`). Scope optional but encouraged (`feat(events): …`).
- Reference tickets or issue IDs in the body when relevant. Keep commits focused—separate refactors from feature changes.
- Pull requests should include: summary of changes, testing notes (commands/results), screenshots or API samples for UI/API updates, and migration callouts when the database schema changes.

## Environment & Configuration Tips

- Copy `.env.example` to `.env` and fill mandatory secrets before running `bun run dev`. The worker shares the database credentials with the server.
- After altering the `event` table (columns, constraints, indexes), review the worker SQL helpers (`apps/worker/src/db/events.ts`) and the generated event object types/shape (`apps/worker/src/utils/mailparser.ts`) to ensure inserts remain valid and all required fields are populated.
