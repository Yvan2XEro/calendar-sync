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

The repository now includes a root-level `docker-compose.yml` that builds the admin server and worker images alongside PostgreSQL. To boot the entire stack in the background run:

```bash
docker compose up --build -d
```

All of the runtime environment variables documented in the [wiki](WIKI.md#8-environment--deployment) are exposed through the compose file. Override them by exporting variables locally or creating a `.env` file next to `docker-compose.yml` before running the command above.

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
