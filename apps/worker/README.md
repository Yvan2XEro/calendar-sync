# Calendar Worker

This worker discovers active providers from the database, connects to their IMAP mailboxes, extracts event data from inbound messages, and persists normalized `event` rows.

## Directory layout

```
apps/worker/
└─ src/
   ├─ config/       # environment and runtime configuration helpers
   ├─ db/           # database helpers built on Bun SQL (providers, events)
   ├─ dev/          # optional ad-hoc development scripts
   ├─ imap/         # per-provider IMAP session orchestration
   ├─ ingest/       # (reserved) message ingestion pipelines
   ├─ services/     # shared infrastructure (logging, backoff, concurrency)
   ├─ types/        # TypeScript types shared across modules
   └─ utils/        # utilities including the AI extraction helper
```

## Running the worker

The worker uses the same Postgres connection environment variables as the Next.js server. Additional knobs:

- `WORKER_MAX_CONCURRENT_PROVIDERS` (default `5`)
- `WORKER_POLL_INTERVAL_MS` (default `300000` / 5 minutes)
- `WORKER_IDLE_KEEPALIVE_MS` (default `15000`)
- `WORKER_BACKOFF_MIN_MS` (default `1000`)
- `WORKER_BACKOFF_MAX_MS` (default `60000`)

Scripts (run from `apps/worker/`):

- `bun run start` — run the worker once.
- `bun run dev` — run with hot-reload for development.
- `bun run dev:test` — execute the optional development script under `src/dev/test.ts`.

Install dependencies with `bun install` at the repository root.
