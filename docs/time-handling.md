# Calendar link time handling

- Client-side calendar helpers (`apps/server/src/lib/calendar-links.ts`) inspect each event's metadata for `timezone`, `timeZone`, or `tz`. When a valid IANA timezone is present, links use local date/times together with `ctz` (Google) or `TZID` (ICS). Otherwise, the helpers fall back to the stored UTC timestamp (`...Z`) without inventing defaults.
- End times default to one hour after the start only when no `endAt` exists or it is invalid/earlier than the start. This avoids zero-length calendar entries while staying predictable.
- URL query parameters truncate long descriptions to 900 characters (with an ellipsis) so Google/Yahoo/Outlook links remain reliable. The generated ICS file always contains the full description plus the source URL, so importing the file preserves the complete context.
- Date filtering in the `/events` view relies on `formatDateBadge`, which prefers the event’s own timezone (if one exists) to derive a `YYYY-MM-DD` key. Without a timezone, the UTC ISO date is used.
- ICS files add `X-WR-TIMEZONE` only when the event provides a trustworthy timezone. Location and URL fields are escaped per RFC 5545 to keep special characters safe during import.

Known edge cases:

- All-day events aren’t specially handled because the current event payloads do not expose an `isAllDay` flag. If that metadata becomes available, Google/ICS helpers can be extended to emit `VALUE=DATE` entries.
- When providers send ambiguous or invalid timezone strings, helpers silently fall back to UTC rather than throwing errors, ensuring link generation still succeeds.
