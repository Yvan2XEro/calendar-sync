import type { Credentials } from "google-auth-library";
import { google, type calendar_v3 } from "googleapis";
import { getEventTimezone } from "@/lib/calendar-links";

// -----------------------
// Constants
// -----------------------
export const GOOGLE_CALENDAR_SCOPES = [
	"https://www.googleapis.com/auth/calendar",
] as const;

export const GOOGLE_OAUTH_SCOPES = [
	...GOOGLE_CALENDAR_SCOPES,
	"openid",
	"email",
] as const;

const DEFAULT_MEETING_LENGTH_MS = 60 * 60 * 1000;

// -----------------------
// Types
// -----------------------
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

type ServiceAccountConfig = {
	serviceAccountEmail: string;
	impersonatedUser: string;
};

export type GoogleStoredOAuthCredentials = {
	accessToken: string;
	refreshToken?: string | null;
	tokenExpiresAt?: Date | null;
	scope?: string | null;
};

// -----------------------
// Environment checks
// -----------------------
export function isGoogleCalendarConfigured(): boolean {
	return (
		Boolean(process.env.GOOGLE_CALENDAR_CLIENT_EMAIL?.trim()) &&
		Boolean(process.env.GOOGLE_CALENDAR_IMPERSONATED_USER?.trim())
	);
}

export function isGoogleOAuthConfigured(): boolean {
	// For compatibility; still returns true if Calendar is configured
	return isGoogleCalendarConfigured();
}

// -----------------------
// Internal configuration
// -----------------------
let cachedConfig: ServiceAccountConfig | null = null;

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

// -----------------------
// Keyless service account authentication
// -----------------------
type CachedToken = { token: string; exp: number };
let tokenCache: CachedToken | null = null;

async function getDwdAccessToken(): Promise<string> {
	const { serviceAccountEmail, impersonatedUser } = getServiceAccountConfig();
	const now = Math.floor(Date.now() / 1000);

	// Reuse token if still valid for >5 min
	if (tokenCache && tokenCache.exp - now > 300) return tokenCache.token;

	const claims = {
		iss: serviceAccountEmail,
		sub: impersonatedUser,
		scope: GOOGLE_CALENDAR_SCOPES.join(" "),
		aud: "https://oauth2.googleapis.com/token",
		iat: now,
		exp: now + 3600,
	};

	const auth = new google.auth.GoogleAuth({
		scopes: ["https://www.googleapis.com/auth/iam"],
	});
	const client = await auth.getClient();
	const iam = google.iamcredentials("v1");

	const { data } = await iam.projects.serviceAccounts.signJwt({
		name: `projects/-/serviceAccounts/${serviceAccountEmail}`,
		requestBody: { payload: JSON.stringify(claims) },
		auth: client as any,
	});

	if (!data.signedJwt) throw new Error("signJwt failed: missing signedJwt");

	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion: data.signedJwt,
		}),
	});

	const json = (await res.json()) as {
		access_token?: string;
		expires_in?: number;
		error?: string;
		error_description?: string;
	};

	if (!json.access_token) {
		throw new Error(
			`Token exchange failed: ${json.error ?? res.statusText} ${json.error_description ?? ""}`,
		);
	}

	tokenCache = {
		token: json.access_token,
		exp: now + (json.expires_in ?? 3600),
	};

	return tokenCache.token;
}

// -----------------------
// Calendar client factory
// -----------------------
async function getCalendarClient(): Promise<calendar_v3.Calendar> {
	const token = await getDwdAccessToken();
	const oauth2 = new google.auth.OAuth2();
	oauth2.setCredentials({ access_token: token });
	return google.calendar({ version: "v3", auth: oauth2 });
}

// -----------------------
// OAuth (kept for compatibility; no secret used)
// -----------------------
export function createGoogleOAuthClient(redirectUri: string) {
	// Dummy compatible method to avoid breaking imports
	// Uses the service account token behind the scenes
	const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
	if (!clientId) {
		throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID");
	}
	const oauth2 = new google.auth.OAuth2(clientId, undefined, redirectUri);
	return oauth2;
}

function shouldRefreshCredentials(credentials: Credentials): boolean {
	if (!credentials.access_token) return true;
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
	// Backward-compatible path — reuses DWD token
	const accessToken = await getDwdAccessToken();
	const oauth2 = createGoogleOAuthClient(redirectUri);
	oauth2.setCredentials({ access_token: accessToken });
	return {
		client: google.calendar({ version: "v3", auth: oauth2 }),
		refreshedCredentials: null,
	};
}

// -----------------------
// Date helpers
// -----------------------
const formatDate = (d: Date) => d.toISOString().slice(0, 10);

function resolveEndDate(start: Date, rawEnd: Date | null): Date {
	if (!rawEnd || Number.isNaN(rawEnd.getTime()))
		return new Date(start.getTime() + DEFAULT_MEETING_LENGTH_MS);
	if (rawEnd.getTime() <= start.getTime())
		return new Date(start.getTime() + DEFAULT_MEETING_LENGTH_MS);
	return rawEnd;
}

function buildEventResource(
	event: GoogleCalendarEventInput,
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
		const startDate = formatDate(event.startAt);
		const endDate = formatDate(
			event.endAt ?? new Date(event.startAt.getTime() + 24 * 60 * 60 * 1000),
		);
		resource.start = { date: startDate };
		resource.end = { date: endDate };
	} else {
		const endAt = resolveEndDate(event.startAt, event.endAt);
		resource.start = {
			dateTime: event.startAt.toISOString(),
			timeZone: timezone,
		};
		resource.end = { dateTime: endAt.toISOString(), timeZone: timezone };
	}

	return resource;
}

// -----------------------
// CRUD operations
// -----------------------
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
	const body = buildEventResource(event);

	if (existingEventId) {
		const res = await calendarClient.events.patch({
			calendarId,
			eventId: existingEventId,
			requestBody: body,
		});
		return res.data.id ?? existingEventId;
	}

	const res = await calendarClient.events.insert({
		calendarId,
		requestBody: body,
	});
	if (!res.data.id)
		throw new Error("Google Calendar did not return an event ID");
	return res.data.id;
}

function isNotFoundError(error: unknown): boolean {
	const status =
		(error as any)?.code ??
		(error as any)?.status ??
		(error as any)?.response?.status;
	return status === 404;
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
		await calendarClient.events.delete({ calendarId, eventId });
	} catch (err) {
		if (isNotFoundError(err)) return;
		throw err;
	}
}
