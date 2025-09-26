const URL_DESCRIPTION_LIMIT = 900;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export type CalendarEventInput = {
  id: string;
  title: string;
  startAt: string | Date;
  endAt?: string | Date | null;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown> | null | undefined;
};

export function getEventTimezone(event: CalendarEventInput): string | undefined {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const candidates = [
    (metadata as Record<string, unknown>).timezone,
    (metadata as Record<string, unknown>).timeZone,
    (metadata as Record<string, unknown>).tz,
  ];

  const timezone = candidates.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  if (!timezone) return undefined;

  try {
    // Throws if the timezone identifier is invalid
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return undefined;
  }
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function getSafeEndDate(start: Date, potentialEnd?: Date | null): Date {
  if (!potentialEnd) {
    return new Date(start.getTime() + DEFAULT_DURATION_MS);
  }

  if (Number.isNaN(potentialEnd.getTime())) {
    return new Date(start.getTime() + DEFAULT_DURATION_MS);
  }

  if (potentialEnd.getTime() <= start.getTime()) {
    return new Date(start.getTime() + DEFAULT_DURATION_MS);
  }

  return potentialEnd;
}

type DateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function getDateParts(date: Date, timeZone?: string): DateParts | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(date).reduce<Record<string, string>>(
      (acc, part) => {
        if (part.type !== "literal") {
          acc[part.type] = part.value;
        }
        return acc;
      },
      {},
    );

    const { year, month, day, hour, minute, second } = parts;
    if (!year || !month || !day || !hour || !minute || !second) {
      return null;
    }

    return { year, month, day, hour, minute, second };
  } catch {
    return null;
  }
}

function formatLocalDateTime(date: Date, timeZone: string): string | null {
  const parts = getDateParts(date, timeZone);
  if (!parts) return null;
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function formatLocalDate(date: Date, timeZone: string): string | null {
  const parts = getDateParts(date, timeZone);
  if (!parts) return null;
  return `${parts.year}${parts.month}${parts.day}`;
}

function formatUtcBasic(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

function formatOutlookDate(date: Date, timeZone?: string): string {
  if (!timeZone) {
    return date.toISOString().slice(0, 19);
  }

  const parts = getDateParts(date, timeZone);
  if (!parts) {
    return date.toISOString().slice(0, 19);
  }

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function truncateDescription(description: string): string {
  if (description.length <= URL_DESCRIPTION_LIMIT) {
    return description;
  }
  return `${description.slice(0, URL_DESCRIPTION_LIMIT - 1)}…`;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function safeLocation(event: CalendarEventInput): string {
  return event.location ? event.location : "";
}

function appendLink(details: string, url?: string | null): string {
  if (!url) return details;
  const trimmed = details.trimEnd();
  const separator = trimmed.length > 0 ? "\n\n" : "";
  return `${trimmed}${separator}More info: ${url}`;
}

export function getGoogleCalendarUrl(event: CalendarEventInput): string {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const start = toDate(event.startAt);
  const end = getSafeEndDate(start, event.endAt ? toDate(event.endAt) : undefined);
  const timezone = getEventTimezone(event);
  const description = appendLink(event.description ?? "", event.url ?? undefined);
  const truncated = truncateDescription(description);

  let dateParam: string;
  const query: string[] = [
    `text=${encodeURIComponent(event.title)}`,
    `details=${encodeURIComponent(truncated)}`,
    `location=${encodeURIComponent(safeLocation(event))}`,
  ];

  if (timezone) {
    const startLocal = formatLocalDateTime(start, timezone);
    const endLocal = formatLocalDateTime(end, timezone);
    if (startLocal && endLocal) {
      dateParam = `${startLocal}/${endLocal}`;
      query.push(`dates=${dateParam}`);
      query.push(`ctz=${encodeURIComponent(timezone)}`);
      return `${base}&${query.join("&")}`;
    }
  }

  dateParam = `${formatUtcBasic(start)}/${formatUtcBasic(end)}`;
  query.push(`dates=${dateParam}`);
  return `${base}&${query.join("&")}`;
}

export function getOutlookCalendarUrl(event: CalendarEventInput): string {
  const base = "https://outlook.office.com/calendar/0/deeplink/compose";
  const start = toDate(event.startAt);
  const end = getSafeEndDate(start, event.endAt ? toDate(event.endAt) : undefined);
  const timezone = getEventTimezone(event);
  const description = appendLink(event.description ?? "", event.url ?? undefined);
  const truncated = truncateDescription(description);

  const query = [
    "path=%2Fcalendar%2Faction%2Fcompose",
    "rru=addevent",
    `subject=${encodeURIComponent(event.title)}`,
    `startdt=${encodeURIComponent(formatOutlookDate(start, timezone))}`,
    `enddt=${encodeURIComponent(formatOutlookDate(end, timezone))}`,
    `body=${encodeURIComponent(truncated)}`,
    `location=${encodeURIComponent(safeLocation(event))}`,
  ];

  return `${base}?${query.join("&")}`;
}

export function getYahooCalendarUrl(event: CalendarEventInput): string {
  const base = "https://calendar.yahoo.com/?v=60&view=d&type=20";
  const start = toDate(event.startAt);
  const end = getSafeEndDate(start, event.endAt ? toDate(event.endAt) : undefined);
  const description = appendLink(event.description ?? "", event.url ?? undefined);
  const truncated = truncateDescription(description);

  const durationMs = Math.max(end.getTime() - start.getTime(), DEFAULT_DURATION_MS);
  const durationMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const cappedHours = Math.min(hours, 99);
  const durationString = `${String(cappedHours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;

  const query = [
    `title=${encodeURIComponent(event.title)}`,
    `st=${formatUtcBasic(start)}`,
    `dur=${durationString}`,
    `desc=${encodeURIComponent(truncated)}`,
    `in_loc=${encodeURIComponent(safeLocation(event))}`,
  ];

  return `${base}&${query.join("&")}`;
}

export function buildICS(event: CalendarEventInput): string {
  const start = toDate(event.startAt);
  const end = getSafeEndDate(start, event.endAt ? toDate(event.endAt) : undefined);
  const timezone = getEventTimezone(event);
  const description = appendLink(event.description ?? "", event.url ?? undefined);

  const uid = `${event.id}@calendarsync.local`;
  const dtstamp = formatUtcBasic(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CalendarSync//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (timezone) {
    const startLocal = formatLocalDateTime(start, timezone);
    const endLocal = formatLocalDateTime(end, timezone);
    if (startLocal && endLocal) {
      lines.push(`DTSTART;TZID=${timezone}:${startLocal}`);
      lines.push(`DTEND;TZID=${timezone}:${endLocal}`);
      lines.push(`X-WR-TIMEZONE:${timezone}`);
    } else {
      lines.push(`DTSTART:${formatUtcBasic(start)}`);
      lines.push(`DTEND:${formatUtcBasic(end)}`);
    }
  } else {
    lines.push(`DTSTART:${formatUtcBasic(start)}`);
    lines.push(`DTEND:${formatUtcBasic(end)}`);
  }

  lines.push(`DTSTAMP:${dtstamp}`);
  lines.push(`DESCRIPTION:${escapeText(description)}`);

  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }

  if (event.url) {
    lines.push(`URL:${escapeText(event.url)}`);
  }

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

function toSafeFileName(title: string, fallback: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const base = normalized.length > 0 ? normalized : fallback;
  return `${base}.ics`;
}

export function downloadICS(event: CalendarEventInput, fileName?: string) {
  const ics = buildICS(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName ?? toSafeFileName(event.title, `event-${event.id}`);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function formatEventDateRange(
  event: CalendarEventInput,
  formatter: (start: Date, end: Date, timeZone?: string) => string,
): string {
  const start = toDate(event.startAt);
  const end = getSafeEndDate(start, event.endAt ? toDate(event.endAt) : undefined);
  const timezone = getEventTimezone(event);
  return formatter(start, end, timezone);
}

export function formatDateBadge(event: CalendarEventInput): string {
  const timezone = getEventTimezone(event);
  const start = toDate(event.startAt);
  if (timezone) {
    const dateOnly = formatLocalDate(start, timezone);
    if (dateOnly) {
      return `${dateOnly.slice(0, 4)}-${dateOnly.slice(4, 6)}-${dateOnly.slice(6, 8)}`;
    }
  }
  return start.toISOString().split("T")[0];
}
