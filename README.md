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
- **Biome** - Linting and formatting

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Monitoring worker activity

Administrators can open [`/admin/logs`](apps/server/src/app/(site)/admin/logs/page.tsx) in the admin console to watch worker sessions in real time. The page keeps a live Server-Sent Events (SSE) subscription open to the server, streams new rows from the `worker_log` table into the UI, and augments them with history fetched through tRPC. The SSE channel is strictly one-way for monitoring purposes—no writes or admin actions are performed over the stream.

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

1. Make sure you have a PostgreSQL database set up.
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
