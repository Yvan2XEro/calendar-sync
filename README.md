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
