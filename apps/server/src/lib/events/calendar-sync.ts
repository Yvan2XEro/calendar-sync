import { and, eq, lte } from "drizzle-orm";

import { db } from "@/db";
import {
	event,
	eventAutomationJob,
	organizationProvider,
	provider,
} from "@/db/schema/app";
import {
	deleteGoogleCalendarEvent,
	type GoogleCalendarEventInput,
	isGoogleCalendarConfigured,
	upsertGoogleCalendarEvent,
} from "@/lib/integrations/google-calendar";

const DEFAULT_BATCH_SIZE = 10;

type SyncAction = "created" | "updated" | "deleted" | "skipped";

type OrganizationCalendarConfig = {
	calendarId: string;
};

type EventRow = {
	id: string;
	title: string;
	description: string | null;
	location: string | null;
	url: string | null;
	startAt: Date;
	endAt: Date | null;
	isAllDay: boolean;
	isPublished: boolean;
	status: (typeof event.status.enumValues)[number];
	metadata: Record<string, unknown> | null;
	organizationId: string | null;
	googleCalendarEventId: string | null;
};

type CalendarSyncSummary = {
	total: number;
	processed: number;
	created: number;
	updated: number;
	deleted: number;
	skipped: number;
	failed: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCalendarId(config: Record<string, unknown>): string | null {
	const raw = config.calendarId ?? config.calendar_id ?? config.id;
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	return trimmed.length > 0 ? trimmed : null;
}

async function resolveOrganizationCalendar(
	organizationId: string,
): Promise<OrganizationCalendarConfig | null> {
	const rows = await db
		.select({ config: provider.config })
		.from(organizationProvider)
		.innerJoin(provider, eq(provider.id, organizationProvider.providerId))
		.where(
			and(
				eq(organizationProvider.organizationId, organizationId),
				eq(provider.category, "google"),
			),
		)
		.limit(5);

	for (const row of rows) {
		if (!row.config || !isRecord(row.config)) continue;
		const calendarId = parseCalendarId(row.config);
		if (calendarId) {
			return { calendarId } satisfies OrganizationCalendarConfig;
		}
	}

	return null;
}

function toGoogleCalendarInput(row: EventRow): GoogleCalendarEventInput {
	return {
		id: row.id,
		title: row.title,
		startAt: row.startAt,
		endAt: row.endAt,
		isAllDay: row.isAllDay,
		description: row.description ?? undefined,
		location: row.location ?? undefined,
		url: row.url ?? undefined,
		metadata: row.metadata ?? undefined,
	} satisfies GoogleCalendarEventInput;
}

export async function syncEventWithGoogleCalendar(
	eventId: string,
): Promise<SyncAction> {
	if (!isGoogleCalendarConfigured()) {
		throw new Error("Google Calendar integration is not configured");
	}

	const rows = await db
		.select({
			id: event.id,
			title: event.title,
			description: event.description,
			location: event.location,
			url: event.url,
			startAt: event.startAt,
			endAt: event.endAt,
			isAllDay: event.isAllDay,
			isPublished: event.isPublished,
			status: event.status,
			metadata: event.metadata,
			organizationId: event.organizationId,
			googleCalendarEventId: event.googleCalendarEventId,
		})
		.from(event)
		.where(eq(event.id, eventId))
		.limit(1);

	const current = rows.at(0) as EventRow | undefined;
	if (!current) {
		return "skipped";
	}

	if (!current.organizationId) {
		if (current.googleCalendarEventId) {
			throw new Error("Cannot sync event without an owning organization");
		}
		return "skipped";
	}

	const calendarConfig = await resolveOrganizationCalendar(
		current.organizationId,
	);
	if (!calendarConfig) {
		throw new Error("Organization is not linked to a Google Calendar");
	}

	if (current.status !== "approved" || !current.isPublished) {
		if (!current.googleCalendarEventId) {
			return "skipped";
		}

		await deleteGoogleCalendarEvent({
			calendarId: calendarConfig.calendarId,
			eventId: current.googleCalendarEventId,
		});

		await db
			.update(event)
			.set({ googleCalendarEventId: null })
			.where(eq(event.id, current.id));

		return "deleted";
	}

	const googleEventId = await upsertGoogleCalendarEvent({
		calendarId: calendarConfig.calendarId,
		existingEventId: current.googleCalendarEventId,
		event: toGoogleCalendarInput(current),
	});

	if (googleEventId !== current.googleCalendarEventId) {
		await db
			.update(event)
			.set({ googleCalendarEventId: googleEventId })
			.where(eq(event.id, current.id));
	}

	return current.googleCalendarEventId ? "updated" : "created";
}

export async function processPendingCalendarSyncJobs(
	limit = DEFAULT_BATCH_SIZE,
): Promise<CalendarSyncSummary> {
	const now = new Date();
	const pendingJobs = await db
		.select({
			id: eventAutomationJob.id,
			eventId: eventAutomationJob.eventId,
			attempts: eventAutomationJob.attempts,
		})
		.from(eventAutomationJob)
		.where(
			and(
				eq(eventAutomationJob.type, "calendar_sync"),
				eq(eventAutomationJob.status, "pending"),
				lte(eventAutomationJob.scheduledAt, now),
			),
		)
		.orderBy(eventAutomationJob.scheduledAt)
		.limit(limit);

	const summary: CalendarSyncSummary = {
		total: pendingJobs.length,
		processed: 0,
		created: 0,
		updated: 0,
		deleted: 0,
		skipped: 0,
		failed: 0,
	};

	for (const job of pendingJobs) {
		const [claimed] = await db
			.update(eventAutomationJob)
			.set({
				status: "processing",
				attempts: job.attempts + 1,
			})
			.where(
				and(
					eq(eventAutomationJob.id, job.id),
					eq(eventAutomationJob.status, "pending"),
				),
			)
			.returning({
				id: eventAutomationJob.id,
				eventId: eventAutomationJob.eventId,
			});

		if (!claimed) {
			continue;
		}

		summary.processed += 1;

		try {
			const action = await syncEventWithGoogleCalendar(claimed.eventId);

			switch (action) {
				case "created":
					summary.created += 1;
					break;
				case "updated":
					summary.updated += 1;
					break;
				case "deleted":
					summary.deleted += 1;
					break;
				case "skipped":
					summary.skipped += 1;
					break;
			}

			await db
				.update(eventAutomationJob)
				.set({ status: "completed", lastError: null })
				.where(eq(eventAutomationJob.id, job.id));
		} catch (error) {
			summary.failed += 1;
			const message =
				error instanceof Error ? error.message : "Unknown calendar sync error";

			await db
				.update(eventAutomationJob)
				.set({ status: "failed", lastError: message })
				.where(eq(eventAutomationJob.id, job.id));
		}
	}

	return summary;
}
