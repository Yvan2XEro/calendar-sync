# Calendar connection UX & integration plan

## Current state analysis

- The cron entry point at `apps/server/src/app/(api)/api/cron/calendar/route.ts` only delegates to `processPendingCalendarSyncJobs`, which expects the Google integration to already be configured and simply cycles through pending jobs.【F:apps/server/src/app/(api)/api/cron/calendar/route.ts†L1-L24】
- `processPendingCalendarSyncJobs` depends on `syncEventWithGoogleCalendar`, which fails fast when either the global Google service account credentials are missing or the owning organization lacks a `calendarId` value in one of its linked providers.【F:apps/server/src/lib/events/calendar-sync.ts†L102-L180】
- The Google calendar client itself is wired around a domain-wide delegated service account. It only checks for `GOOGLE_CALENDAR_CLIENT_EMAIL` and `GOOGLE_CALENDAR_IMPERSONATED_USER`, and every API call impersonates that single user.【F:apps/server/src/lib/integrations/google-calendar.ts†L23-L121】
- The admin navigation shipped with the dashboard does not expose any surface for calendar integrations—only providers, flags, digests, etc.【F:apps/server/src/config/ui.ts†L13-L32】
- Provider management today is email-centric: the Zod schema for provider configs requires IMAP/SMTP fields and the UI mirrors that shape, so there is no supported path to capture `calendarId`, OAuth tokens, or any Google-specific metadata for an organization.【F:apps/server/src/routers/providers.ts†L16-L200】

Taken together, the current service-account approach works only when operators configure a single shared Google account via environment variables and backfill each organization's `provider.config` with a `calendarId` out-of-band. There is no self-serve flow for organization admins to connect their own Google Workspace calendars, nor a hook for future providers like Outlook.

## Why a dashboard connection page is needed

1. **Per-organization ownership** – `resolveOrganizationCalendar` looks for a provider link with `provider.category === "google"`, but administrators cannot supply the calendar identifier or credentials through the UI. Without a guided connection flow, calendar sync will continue to throw `Organization is not linked to a Google Calendar` for most events.【F:apps/server/src/lib/events/calendar-sync.ts†L62-L146】
2. **Scalability beyond a single domain** – The service account impersonation assumes control of one Google Workspace tenant. Allowing each customer to authorize our app via OAuth lets us expand to independent Google accounts and makes room for other calendar ecosystems.
3. **Extensibility** – The request explicitly mentions "other future implemented calendar platforms". A dedicated "Calendar connections" page with provider-neutral plumbing is the natural place to expose both Google and upcoming integrations.

## Proposed implementation roadmap

1. **Data model groundwork**
   - Introduce a `calendar_connection` table keyed by organization (and optionally user) that stores provider type, external account identifiers, OAuth tokens/refresh tokens (encrypted), calendar IDs, status flags, and audit timestamps.
   - Backfill migrations and Drizzle models; expose typed helpers for reading/writing connections so `processPendingCalendarSyncJobs` can pivot away from the email-centric provider config.

2. **OAuth handshake infrastructure**
   - Add API routes (e.g., `/api/integrations/google-calendar/start` and `/api/integrations/google-calendar/callback`) that kick off the Google OAuth consent screen and persist tokens on return. The start endpoint should accept an organization slug/id and enforce the same admin guard used elsewhere.
   - Implement token refresh utilities and background guards so cron sync always has a valid access token when firing `upsertGoogleCalendarEvent`/`deleteGoogleCalendarEvent`.

3. **Dashboard experience**
   - Extend `defaultNavigation` with a new "Integrations" or "Calendar connections" entry, grouped under Admin, that routes to `/admin/integrations/calendars` (name TBD) and is hidden from non-admins.
   - Build a React page that lists the organization’s current calendar connections, exposes a "Connect Google Calendar" CTA, shows connection status/errors, and supports disconnection. Design the layout so adding Outlook/ICS providers later is a matter of appending cards.
   - Reuse existing breadcrumb/avatar patterns for consistency with the other admin workspaces.

4. **Server procedures & policies**
   - Create TRPC procedures to list, create (post-OAuth), refresh, and delete calendar connections with proper authorization. They should surface metadata needed by the UI and by cron (e.g., selected calendar ID, last sync time, failure reason).
   - Ensure connections are scoped per organization and optionally per environment (e.g., block multiple active Google connections unless multi-calendar support is planned).

5. **Cron/worker integration**
   - Update `resolveOrganizationCalendar` to look up the new `calendar_connection` records instead of the provider config JSON. Fallback to service-account mode only when an organization explicitly opts in.
   - Adjust job enqueueing so new/updated events trigger calendar syncs for each active connection. Handle token refresh errors by marking the connection unhealthy and surfacing that in the dashboard.

6. **Migration & operational tooling**
   - Provide scripts or admin UI actions to migrate existing service-account organizations into the new table (allow manual entry of known calendar IDs).
   - Document environment variable needs for Google OAuth (client ID/secret, redirect URIs) and update README/wiki sections accordingly.

7. **Future-proofing hooks**
   - Abstract provider metadata (icon, copy, OAuth scopes) into a configuration object so supporting additional providers becomes a matter of adding entries.
   - Define integration testing stubs/mocks for Google so we can automate regression tests for the OAuth callback and cron sync pipeline.

This plan establishes a user-facing navigation entry for calendar connections, unlocks self-serve Google authorization, and lays the groundwork for integrating other calendar platforms down the line.
