# Worker App

This worker polls IMAP mailboxes and extracts event data into the calendar database.

## Project layout

```
apps/worker/
└─ src/
   ├─ config/      # runtime configuration helpers (placeholder)
   ├─ db/          # database access utilities (placeholder)
   ├─ dev/         # local-only scripts (e.g. src/dev/test.ts)
   ├─ imap/        # IMAP client helpers (placeholder)
   ├─ ingest/      # ingestion pipelines (placeholder)
   ├─ services/    # higher-level business logic (placeholder)
   ├─ types/       # shared TypeScript types (placeholder)
   └─ utils/       # general-purpose utilities (e.g. mailparser)
```

## Scripts

All commands are run from `apps/worker/`.

- `bun run start` – execute the worker entry point (`src/index.ts`).
- `bun run dev` – run the worker in development mode (same entry point).
- `bun run dev:test` – optional ad-hoc extraction test (`src/dev/test.ts`).

Install dependencies with `bun install`.

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
