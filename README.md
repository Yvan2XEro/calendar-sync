# calendar-sync

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Email digests** - Curated newsletters for joined and recommended organizations
- **Biome** - Linting and formatting

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Running with Docker Compose

### Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/) and [Docker Compose Plugin](https://docs.docker.com/compose/install/) installed locally.
- A `.env` file at the repository root that provides the secrets consumed by the compose file. At a minimum you must define the OpenID Connect credentials (`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`), the tRPC cron secret (`CRON_SECRET`), and any third-party API keys (for example `GOOGLE_GENERATIVE_AI_API_KEY`). The compose file loads this file automatically through the `env_file` directive.
- Available host ports `3000` (web UI), `54322` (PostgreSQL), and an outbound network connection so the worker can reach remote mail providers.

### Required environment variables

Define the following keys in `.env` before launching the stack. Unless noted otherwise, both the `server` and `worker` containers read the values through the shared env file.

| Variable | Service(s) | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_OIDC_PROVIDER_ID` | server | Stable identifier for the external OpenID Connect provider that Better Auth uses when constructing the OAuth configuration. 【F:docker-compose.yml†L27-L33】【F:apps/server/src/lib/auth.ts†L23-L58】|
| `OIDC_CLIENT_ID` | server | OAuth client identifier issued by the identity provider; injected as a build argument and consumed by the Better Auth generic OAuth plugin. 【F:docker-compose.yml†L27-L33】【F:apps/server/src/lib/auth.ts†L24-L57】|
| `OIDC_CLIENT_SECRET` | server | Client secret paired with the OIDC client ID so the server can complete token exchanges with the provider. 【F:docker-compose.yml†L27-L33】【F:apps/server/src/lib/auth.ts†L24-L57】|
| `OIDC_DISCOVERY_URL` | server | Discovery document URL that describes the provider’s authorization, token, and JWKS endpoints. 【F:docker-compose.yml†L27-L33】【F:apps/server/src/lib/auth.ts†L26-L57】|
| `OIDC_USER_INFO_URL` | server | Optional override that lets the server fetch user profile claims from a custom endpoint after OAuth completes. 【F:docker-compose.yml†L27-L33】【F:apps/server/src/lib/auth.ts†L62-L75】|
| `BETTER_AUTH_SECRET` | server, worker | Shared signing secret required by Better Auth to mint and validate encrypted session cookies. 【F:docker-compose.yml†L40-L45】【F:apps/server/.env.example†L1-L11】|
| `BETTER_AUTH_URL` | server, worker | Canonical URL for the Better Auth instance so callbacks and hosted views resolve to the correct origin. 【F:docker-compose.yml†L40-L45】【F:apps/server/.env.example†L1-L11】|
| `CORS_ORIGIN` | server, worker | Comma-separated list of allowed origins used to configure CORS and credentialed requests across the stack. 【F:docker-compose.yml†L34-L45】【F:apps/server/src/lib/auth.ts†L35-L45】|
| `CRON_SECRET` | cron, server | Shared secret that authenticates the curl-based cron runner against the internal `/api/cron/*` endpoints. 【F:docker-compose.yml†L60-L74】【F:apps/server/src/app/(api)/api/cron/calendar/route.ts†L5-L26】|
| `GOOGLE_GENERATIVE_AI_API_KEY` | server, worker | API key required when enabling the Gemini-powered email extraction pipeline described in the operational wiki. 【F:docker-compose.yml†L40-L45】【F:WIKI.md†L144-L152】|

### Service overview

The root-level [`docker-compose.yml`](docker-compose.yml) wires four long-running services together:

- **postgres** – A `postgres:16.2-alpine` container that seeds the `calendar-sync` database, persists data on the `calendar-sync_postgres_data` volume, and exposes port `54322` to the host. The application containers depend on its health check before starting.
- **server** – Builds the Next.js admin/server image from [`apps/server/Dockerfile`](apps/server/Dockerfile). It injects database, authentication, and third-party credentials via environment variables and runs on port `3000` with a health check hitting the tRPC `healthCheck` endpoint.
- **cron** – A lightweight `curl` runner that periodically calls the server’s internal cron endpoints (`/api/cron/calendar`, `/api/cron/emails`, `/api/cron/waitlist`). It requires the `CRON_SECRET` environment variable to authenticate each request.
- **worker** – Builds the Bun-based ingestion worker from [`apps/worker/Dockerfile`](apps/worker/Dockerfile). It waits for both `postgres` and `server` to become healthy, then processes IMAP inboxes and other background jobs against the shared database.

All of the runtime environment variables documented in the [wiki](WIKI.md#8-environment--deployment) are exposed through the compose file. Override them by exporting variables locally or creating the `.env` file noted above.

To boot the entire stack in the background run:

```bash
docker compose up --build -d
```

## Monitoring worker activity

Administrators can open [`/admin/logs`](apps/server/src/app/(site)/admin/logs/page.tsx) in the admin console to watch worker sessions in real time. The page keeps a live Server-Sent Events (SSE) subscription open to the server, streams new rows from the `worker_log` table into the UI, and augments them with history fetched through tRPC. The SSE channel is strictly one-way for monitoring purposes—no writes or admin actions are performed over the stream.

## Scheduling email digests

The admin navigation includes an **Email digests** workspace at [`/admin/digests`](apps/server/src/app/(site)/admin/digests/page.tsx) where operators can toggle each segment, tune cadence (in hours), and adjust the lookahead window (in days) before saving the configuration. Each card surfaces recent metadata—last and next send times, queued recipients, and the number of populated segments—so teams can verify digest activity at a glance.【F:apps/server/src/config/ui.ts†L13-L32】【F:apps/server/src/app/(site)/admin/digests/page.tsx†L28-L200】

When an administrator saves changes, the TRPC router ensures a schedule exists for every supported segment, persists the enabled state, and enforces cadence and lookahead bounds with sensible defaults (weekly cadence over a two-week window).【F:apps/server/src/routers/admin-digests.ts†L17-L159】 Downstream, the digest composer groups approved, published events into "joined" and "discover" segments, limits the number of highlights per organization, and builds the HTML/text payload that is eventually queued for email delivery.【F:apps/server/src/lib/mailer/digest.ts†L57-L382】

## Moderating synchronized events

The event moderation workspace lives at [`/admin/events`](apps/server/src/app/(site)/admin/events/page.tsx). You must be signed in with an account that has the `admin` role to access it—non-admin users are redirected away by the admin layout guard. Once authenticated, the "Events" item appears in the admin navigation alongside the other moderation tools.

The page is designed for high-volume review and offers several tools that work together:

- **Filter controls** – Search across titles, descriptions, and locations, filter by event status, provider, start date range, publication or all-day flags, and constrain the acceptable priority range. Filters sync to the URL, persist to local storage, and refresh the event list as you adjust them.
- **View switcher** – Toggle between a compact table and card-based layout using the buttons in the header, depending on whether you need a dense overview or richer context for each event.
- **Infinite pagination** – Scroll to the end of the list to load more results. An intersection observer watches the sentinel at the bottom of the page and automatically requests additional pages when needed.
- **Bulk moderation actions** – Select individual rows or cards (or use the header checkbox to select all on the current page) to activate the bulk action bar, then apply the predefined status transitions such as approve, mark pending, or archive to every selected event at once.

Open the drawer or dialog actions in each row/card to see the complete metadata, update individual events, or inspect detailed timing, provider, and flag information before applying changes.

## Tuning the signed-in home experience

- **Recent events carousel size** – Update the `RECENT_EVENTS_LIMIT` constant inside [`apps/server/src/components/dashboard/SignedInHome.tsx`](apps/server/src/components/dashboard/SignedInHome.tsx) to control how many cards render in the slider at once.
- **Discover tab sort options** – Adjust the `discoverSortValues` tuple (and its default fallback of `"name-asc" satisfies DiscoverSort`) in [`apps/server/src/routers/orgs.ts`](apps/server/src/routers/orgs.ts) when changing which sort orders are offered to users by default.
- **Branding copy & visuals** – Edit the hero section markup in the `SignedInHome` component (same module as above) to refresh the welcome message, supporting text, and illustration assets shown to signed-in members.
## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Start PostgreSQL with Docker if you haven't provisioned one yet:

   ```bash
   docker compose up -d postgres
   ```

   This uses the same configuration baked into the application containers so local testing mirrors production defaults.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:
```bash
bun db:push
```


Then, run the development server:

```bash
bun dev
```

The API is running at [http://localhost:3000](http://localhost:3000).





## Project Structure

```
calendar-sync/
├── apps/
│   └── server/      # Backend API (Next, TRPC)
```

## Available Scripts

- `bun dev`: Start all applications in development mode
- `bun build`: Build all applications
- `bun dev:web`: Start only the web application
- `bun dev:server`: Start only the server
- `bun check-types`: Check TypeScript types across all apps
- `bun db:push`: Push schema changes to database
- `bun db:studio`: Open database studio UI
- `bun check`: Run Biome formatting and linting
