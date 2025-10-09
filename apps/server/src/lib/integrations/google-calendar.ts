import type { Credentials, OAuth2Client } from "google-auth-library";
import { type calendar_v3, google } from "googleapis";

import { getEventTimezone } from "@/lib/calendar-links";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
] as const;

export const GOOGLE_OAUTH_SCOPES = [
  ...GOOGLE_CALENDAR_SCOPES,
  "openid",
  "email",
] as const;
const DEFAULT_MEETING_LENGTH_MS = 60 * 60 * 1000;

export type GoogleCalendarEventInput = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  isAllDay: boolean;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
};

// If you're on Node 18+, global fetch is available; otherwise:
// import fetch from "node-fetch";

type ServiceAccountConfig = {
  serviceAccountEmail: string;
  impersonatedUser: string;
};

let cachedConfig: ServiceAccountConfig | null = null;

export function isGoogleCalendarConfigured(): boolean {
  return (
    Boolean(process.env.GOOGLE_CALENDAR_CLIENT_EMAIL?.trim()) &&
    Boolean(process.env.GOOGLE_CALENDAR_IMPERSONATED_USER?.trim())
  );
}

export function isGoogleOAuthConfigured(): boolean {
  return (
    Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()) &&
    Boolean(process.env.GOOGLE_CALENDAR_IMPERSONATED_USER?.trim())
  );
}

function getServiceAccountConfig(): ServiceAccountConfig {
  if (cachedConfig) return cachedConfig;

  const serviceAccountEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL?.trim();
  const impersonatedUser =
    process.env.GOOGLE_CALENDAR_IMPERSONATED_USER?.trim();

  if (!serviceAccountEmail)
    throw new Error("Missing GOOGLE_CALENDAR_CLIENT_EMAIL");
  if (!impersonatedUser)
    throw new Error("Missing GOOGLE_CALENDAR_IMPERSONATED_USER");

  cachedConfig = { serviceAccountEmail, impersonatedUser };
  return cachedConfig;
}

async function getDwdAccessToken(
  scopes: readonly string[],
  subEmail: string,
  saEmail: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: saEmail,
    sub: subEmail,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  // Obtain an authenticated client (ADC or runtime SA)
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/iam"],
  });
  const client = await auth.getClient();

  // Ask Google to sign the JWT (no local private key)
  const iam = google.iamcredentials("v1");
  const { data } = await iam.projects.serviceAccounts.signJwt({
    name: `projects/-/serviceAccounts/${saEmail}`,
    requestBody: { payload: JSON.stringify(claims) },
    auth: client as any,
  });

  const signedJwt = data.signedJwt;
  if (!signedJwt) throw new Error("signJwt did not return a signedJwt");

  // Exchange signed JWT for an OAuth2 access token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  const json = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Token exchange failed: ${json.error ?? res.statusText} ${
        json.error_description ?? ""
      }`.trim()
    );
  }
  return json.access_token;
}

async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const { serviceAccountEmail, impersonatedUser } = getServiceAccountConfig();

  const accessToken = await getDwdAccessToken(
    GOOGLE_CALENDAR_SCOPES,
    impersonatedUser,
    serviceAccountEmail
  );

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });

  return google.calendar({ version: "v3", auth: oauth2 });
}

function getOAuthClientConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

  if (!clientId) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID");
  }

  if (!clientSecret) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_SECRET");
  }

  return { clientId, clientSecret } as const;
}

export function createGoogleOAuthClient(redirectUri: string) {
  const { clientId, clientSecret } = getOAuthClientConfig();
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  ) as unknown as OAuth2Client;
}

export type GoogleStoredOAuthCredentials = {
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  scope?: string | null;
};

function shouldRefreshCredentials(credentials: Credentials): boolean {
  if (!credentials.access_token) {
    return true;
  }

  if (typeof credentials.expiry_date === "number") {
    const threshold = Date.now() + 60_000;
    return credentials.expiry_date <= threshold;
  }

  return false;
}

export async function getOAuthCalendarClient({
  redirectUri,
  stored,
}: {
  redirectUri: string;
  stored: GoogleStoredOAuthCredentials;
}): Promise<{
  client: calendar_v3.Calendar;
  refreshedCredentials: Credentials | null;
}> {
  const oauth2 = createGoogleOAuthClient(redirectUri);

  oauth2.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken ?? undefined,
    expiry_date: stored.tokenExpiresAt?.getTime(),
    scope: stored.scope ?? undefined,
  });

  let refreshed: Credentials | null = null;

  if (shouldRefreshCredentials(oauth2.credentials)) {
    if (!stored.refreshToken) {
      throw new Error(
        "Google Calendar access token is expired and no refresh token is available"
      );
    }

    const response = await oauth2.refreshAccessToken();
    refreshed = response.credentials;
    oauth2.setCredentials(response.credentials);
  }

  return {
    client: (google as any).calendar({ version: "v3", auth: oauth2 }),
    refreshedCredentials: refreshed,
  };
}

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function extractDateParts(date: Date, timeZone?: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    throw new Error("Invalid date parts");
  }

  return { year, month, day } satisfies DateParts;
}

function shiftDateParts(parts: DateParts, days: number): DateParts {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + days);
  const shifted = extractDateParts(base, "UTC");
  return shifted;
}

function formatDateParts(parts: DateParts): string {
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateOnly(date: Date, timeZone?: string, offsetDays = 0): string {
  try {
    const parts = extractDateParts(date, timeZone);
    const shifted =
      offsetDays === 0 ? parts : shiftDateParts(parts, offsetDays);
    return formatDateParts(shifted);
  } catch {
    const adjusted = new Date(date);
    if (offsetDays !== 0) {
      adjusted.setUTCDate(adjusted.getUTCDate() + offsetDays);
    }
    return adjusted.toISOString().slice(0, 10);
  }
}

function resolveEndDate(start: Date, rawEnd: Date | null): Date {
  if (!rawEnd || Number.isNaN(rawEnd.getTime())) {
    return new Date(start.getTime() + DEFAULT_MEETING_LENGTH_MS);
  }

  if (rawEnd.getTime() <= start.getTime()) {
    return new Date(start.getTime() + DEFAULT_MEETING_LENGTH_MS);
  }

  return rawEnd;
}

export function buildEventResource(
  event: GoogleCalendarEventInput
): calendar_v3.Schema$Event {
  const timezone = getEventTimezone({
    id: event.id,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt ?? undefined,
    metadata: event.metadata ?? undefined,
  });

  const resource: calendar_v3.Schema$Event = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    status: "confirmed",
    transparency: "opaque",
    source:
      event.url && event.url.trim().length > 0
        ? { title: event.title, url: event.url }
        : undefined,
    reminders: { useDefault: true },
  };

  if (event.isAllDay) {
    const startDate = formatDateOnly(event.startAt, timezone, 0);
    const endSeed = event.endAt ?? event.startAt;
    const exclusiveEnd = formatDateOnly(endSeed, timezone, 1);
    resource.start = { date: startDate };
    resource.end = { date: exclusiveEnd };
  } else {
    const endAt = resolveEndDate(event.startAt, event.endAt);
    resource.start = {
      dateTime: event.startAt.toISOString(),
      timeZone: timezone,
    };
    resource.end = {
      dateTime: endAt.toISOString(),
      timeZone: timezone,
    };
  }

  return resource;
}

export async function upsertGoogleCalendarEvent({
  calendarId,
  event,
  existingEventId,
  client,
}: {
  calendarId: string;
  event: GoogleCalendarEventInput;
  existingEventId?: string | null;
  client?: calendar_v3.Calendar;
}): Promise<string> {
  const calendarClient = client ?? (await getCalendarClient());
  const requestBody = buildEventResource(event);

  if (existingEventId) {
    const response = await calendarClient.events.patch({
      calendarId,
      eventId: existingEventId,
      requestBody,
    });

    return response.data.id ?? existingEventId;
  }

  const response = await calendarClient.events.insert({
    calendarId,
    requestBody,
  });

  const id = response.data.id;
  if (!id) {
    throw new Error("Google Calendar did not return an event identifier");
  }

  return id;
}

export function isNotFoundError(error: unknown): boolean {
  if (!error) return false;

  const maybeCode = (error as { code?: number }).code;
  if (maybeCode === 404) return true;

  const maybeStatus = (error as { status?: number }).status;
  if (maybeStatus === 404) return true;

  const responseStatus = (error as { response?: { status?: number } }).response
    ?.status;
  if (responseStatus === 404) return true;

  return false;
}

export async function deleteGoogleCalendarEvent({
  calendarId,
  eventId,
  client,
}: {
  calendarId: string;
  eventId: string;
  client?: calendar_v3.Calendar;
}): Promise<void> {
  const calendarClient = client ?? (await getCalendarClient());

  try {
    await calendarClient.events.delete({
      calendarId,
      eventId,
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }
}
