import { type calendar_v3, google } from "googleapis";

import { getEventTimezone } from "@/lib/calendar-links";

const SCOPES = ["https://www.googleapis.com/auth/calendar"] as const;
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

type ServiceAccountConfig = {
	clientEmail: string;
	privateKey: string;
	impersonatedUser?: string;
};

let cachedConfig: ServiceAccountConfig | null = null;

function getServiceAccountConfig(): ServiceAccountConfig {
	if (cachedConfig) {
		return cachedConfig;
	}

	const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL?.trim();
	const privateKey = process.env.GOOGLE_CALENDAR_PRIVATE_KEY;

	if (!clientEmail || !privateKey) {
		throw new Error(
			"Google Calendar service account credentials are not configured",
		);
	}

	const normalizedKey = privateKey.includes("\\n")
		? privateKey.replace(/\\n/g, "\n")
		: privateKey;

	const impersonatedUser =
		process.env.GOOGLE_CALENDAR_IMPERSONATED_USER?.trim();

	cachedConfig = {
		clientEmail,
		privateKey: normalizedKey,
		impersonatedUser:
			impersonatedUser && impersonatedUser.length > 0
				? impersonatedUser
				: undefined,
	} satisfies ServiceAccountConfig;

	return cachedConfig;
}

export function isGoogleCalendarConfigured(): boolean {
	try {
		getServiceAccountConfig();
		return true;
	} catch {
		return false;
	}
}

async function getCalendarClient(): Promise<calendar_v3.Calendar> {
	const config = getServiceAccountConfig();
	const auth = new google.auth.JWT({
		email: config.clientEmail,
		key: config.privateKey,
		scopes: SCOPES,
		subject: config.impersonatedUser,
	});

	await auth.authorize();

	return google.calendar({ version: "v3", auth });
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
}: {
	calendarId: string;
	event: GoogleCalendarEventInput;
	existingEventId?: string | null;
}): Promise<string> {
	const client = await getCalendarClient();
	const requestBody = buildEventResource(event);

	if (existingEventId) {
		const response = await client.events.patch({
			calendarId,
			eventId: existingEventId,
			requestBody,
		});

		return response.data.id ?? existingEventId;
	}

	const response = await client.events.insert({
		calendarId,
		requestBody,
	});

	const id = response.data.id;
	if (!id) {
		throw new Error("Google Calendar did not return an event identifier");
	}

	return id;
}

function isNotFoundError(error: unknown): boolean {
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
}: {
	calendarId: string;
	eventId: string;
}): Promise<void> {
	const client = await getCalendarClient();

	try {
		await client.events.delete({
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
