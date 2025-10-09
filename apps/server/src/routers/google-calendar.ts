import { TRPCError } from "@trpc/server";
import type { calendar_v3 } from "googleapis";
import { z } from "zod";
import type {
	EventHeroMedia,
	EventLandingPageContent,
} from "@/lib/event-content";
import { getCalendarClientForUser } from "@/lib/google-calendar";
import { protectedProcedure, router } from "@/lib/trpc";

const DEFAULT_MAX_RESULTS = 250;
const DEFAULT_CALENDAR_ID = "primary";

const listUpcomingEventsInput = z
	.object({
		calendarId: z.string().min(1).default(DEFAULT_CALENDAR_ID),
		maxResults: z.number().int().min(1).max(500).default(DEFAULT_MAX_RESULTS),
	})
	.optional();

type CalendarEventSummary = {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	location: string | null;
	url: string | null;
	heroMedia: EventHeroMedia;
	landingPage: EventLandingPageContent;
	startAt: Date;
	endAt: Date | null;
	organization: {
		id: string;
		name: string;
		slug: string;
	};
	providerName: string;
	imageUrl: string | null;
};

export const googleCalendarRouter = router({
	listUpcomingEvents: protectedProcedure
		.input(listUpcomingEventsInput)
		.query(async ({ ctx, input }) => {
			const sessionUser = ctx.session.user as { id?: string };
			const userId = sessionUser.id;

			if (!userId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Authentication required",
				});
			}

			const calendarId = input?.calendarId ?? DEFAULT_CALENDAR_ID;
			const maxResults = input?.maxResults ?? DEFAULT_MAX_RESULTS;

			let calendarClient: Awaited<ReturnType<typeof getCalendarClientForUser>>;
			try {
				calendarClient = await getCalendarClientForUser(userId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Google account not connected",
				});
			}

			const now = new Date();

			let eventsResponse: calendar_v3.Schema$Events;
			try {
				const { data } = await calendarClient.calendar.events.list({
					calendarId,
					maxResults,
					singleEvents: true,
					orderBy: "startTime",
					timeMin: now.toISOString(),
				});
				eventsResponse = data;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unable to load Google Calendar events",
					cause: error,
				});
			}

			const calendarSummary = sanitizeCalendarName(eventsResponse.summary);

			const events = (eventsResponse.items ?? [])
				.map((event) =>
					mapGoogleEventToCalendarEvent({
						event,
						calendarId,
						calendarName: calendarSummary,
					}),
				)
				.filter((event): event is CalendarEventSummary => event !== null);

			return events;
		}),
});

type MapEventParams = {
	event: calendar_v3.Schema$Event;
	calendarId: string;
	calendarName: string;
};

function mapGoogleEventToCalendarEvent({
	event,
	calendarId,
	calendarName,
}: MapEventParams): CalendarEventSummary | null {
	const start = parseGoogleDate(event.start);
	if (!start) return null;

	const end = parseGoogleDate(event.end);
	const id = event.id ?? event.iCalUID ?? `${calendarId}-${start.getTime()}`;

	return {
		id,
		slug: id,
		title: event.summary ?? "Untitled event",
		description: event.description ?? null,
		location: event.location ?? null,
		url: event.htmlLink ?? null,
		heroMedia: {},
		landingPage: {},
		startAt: start,
		endAt: end,
		organization: {
			id: calendarId,
			name: calendarName,
			slug: createSlug(calendarName) ?? "google-calendar",
		},
		providerName: "Google Calendar",
		imageUrl: null,
	};
}

function parseGoogleDate(
	value: calendar_v3.Schema$EventDateTime | undefined | null,
): Date | null {
	if (!value) return null;
	if (value.dateTime) {
		return new Date(value.dateTime);
	}
	if (value.date) {
		return new Date(`${value.date}T00:00:00Z`);
	}
	return null;
}

function sanitizeCalendarName(name: string | undefined | null): string {
	const trimmed = name?.trim();
	if (!trimmed) return "Google Calendar";
	return trimmed;
}

function createSlug(value: string): string | null {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.trim();
	if (slug.length === 0) {
		return null;
	}
	return slug;
}
