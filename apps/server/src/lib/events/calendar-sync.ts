import { and, eq, isNull, lte } from "drizzle-orm";
import type { calendar_v3 } from "googleapis";
import { db } from "@/db";
import {
	calendarConnection,
	event,
	eventAutomationJob,
	eventCalendarSync,
	eventCalendarSyncStatus,
	organizationProvider,
	provider,
} from "@/db/schema/app";
import { member } from "@/db/schema/auth";
import {
	clearConnectionCredentials,
	markConnectionStatus,
	resolveGoogleCalendarConnection,
	type SanitizedCalendarConnection,
	touchConnectionSynced,
	updateConnectionCredentials,
} from "@/lib/calendar-connections";
import { buildEventDetailUrl } from "@/lib/events/urls";
import { getCalendarClientForUser } from "@/lib/google-calendar";
import {
	deleteGoogleCalendarEvent,
	type GoogleCalendarEventInput,
	type GoogleStoredOAuthCredentials,
	getOAuthCalendarClient,
	isGoogleCalendarConfigured,
	upsertGoogleCalendarEvent,
} from "@/lib/integrations/google-calendar";
import { buildAbsoluteUrl } from "@/lib/site-metadata";

const DEFAULT_BATCH_SIZE = 10;

type SyncAction = "created" | "updated" | "deleted" | "skipped";

export class CalendarSyncUnavailableError extends Error {
	constructor(
		readonly scope: "organization" | "user",
		message: string,
	) {
		super(message);
		this.name = "CalendarSyncUnavailableError";
	}
}

type OAuthCalendarConfig = {
	type: "oauth";
	calendarId: string;
	credentials: GoogleStoredOAuthCredentials;
	connection: SanitizedCalendarConnection;
};

type ServiceAccountCalendarConfig = {
	type: "service-account";
	calendarId: string;
};

type OrganizationCalendarConfig =
	| OAuthCalendarConfig
	| ServiceAccountCalendarConfig;

type EventRow = {
	id: string;
	title: string;
	description: string | null;
	location: string | null;
	slug: string;
	startAt: Date;
	endAt: Date | null;
	isAllDay: boolean;
	isPublished: boolean;
	status: (typeof event.status.enumValues)[number];
	metadata: Record<string, unknown> | null;
	organizationId: string | null;
};

type EventCalendarSyncRow = typeof eventCalendarSync.$inferSelect;

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
	memberId?: string,
): Promise<OrganizationCalendarConfig | null> {
	const oauthConnection = await resolveGoogleCalendarConnection(
		organizationId,
		memberId,
	);
	if (oauthConnection) {
		if (!oauthConnection.calendarId) {
			await markConnectionStatus(
				oauthConnection.id,
				"error",
				"Connected Google Calendar is missing a calendar identifier",
			);
			throw new Error(
				"Connected Google Calendar is missing a calendar identifier",
			);
		}

		if (!oauthConnection.accessToken) {
			await markConnectionStatus(
				oauthConnection.id,
				"error",
				"Google Calendar OAuth credentials are missing",
			);
			throw new Error("Google Calendar OAuth credentials are missing");
		}

		const credentials: GoogleStoredOAuthCredentials = {
			accessToken: oauthConnection.accessToken,
			refreshToken: oauthConnection.refreshToken ?? undefined,
			scope: oauthConnection.scope ?? undefined,
		};

		if (oauthConnection.tokenExpiresAt) {
			credentials.tokenExpiresAt = oauthConnection.tokenExpiresAt;
		}

		return {
			type: "oauth",
			calendarId: oauthConnection.calendarId,
			connection: oauthConnection,
			credentials,
		} satisfies OAuthCalendarConfig;
	}

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
			return {
				type: "service-account",
				calendarId,
			} satisfies ServiceAccountCalendarConfig;
		}
	}

	return null;
}

function toGoogleCalendarInput(row: EventRow): GoogleCalendarEventInput {
	const detailUrl = buildEventDetailUrl(row.slug);
	return {
		id: row.id,
		title: row.title,
		startAt: row.startAt,
		endAt: row.endAt,
		isAllDay: row.isAllDay,
		description: row.description ?? undefined,
		location: row.location ?? undefined,
		url: detailUrl,
		metadata: row.metadata ?? undefined,
	} satisfies GoogleCalendarEventInput;
}

type SyncEventOptions = {
	memberId?: string;
	userId?: string;
};

function buildSyncConditions(eventId: string, memberId: string | null) {
	const conditions = [eq(eventCalendarSync.eventId, eventId)];

	if (memberId) {
		conditions.push(eq(eventCalendarSync.memberId, memberId));
	} else {
		conditions.push(isNull(eventCalendarSync.memberId));
	}

	return and(...conditions);
}

async function fetchSyncRecord(eventId: string, memberId: string | null) {
	const rows = await db
		.select({
			id: eventCalendarSync.id,
			eventId: eventCalendarSync.eventId,
			memberId: eventCalendarSync.memberId,
			googleEventId: eventCalendarSync.googleEventId,
			status: eventCalendarSync.status,
			lastSyncedAt: eventCalendarSync.lastSyncedAt,
			failureReason: eventCalendarSync.failureReason,
		})
		.from(eventCalendarSync)
		.where(buildSyncConditions(eventId, memberId))
		.limit(1);

	return rows.at(0) ?? null;
}

async function ensureSyncRecord(eventId: string, memberId: string | null) {
	const existing = await fetchSyncRecord(eventId, memberId);
	if (existing) return existing;

	await db
		.insert(eventCalendarSync)
		.values({
			eventId,
			memberId,
			status: "pending",
		})
		.onConflictDoNothing({
			target: [eventCalendarSync.eventId, eventCalendarSync.memberId],
		});

	return (await fetchSyncRecord(
		eventId,
		memberId,
	)) as EventCalendarSyncRow | null;
}

async function updateSyncRecord(
	eventId: string,
	memberId: string | null,
	updates: Partial<
		Pick<
			EventCalendarSyncRow,
			"googleEventId" | "status" | "lastSyncedAt" | "failureReason"
		>
	>,
) {
	const payload: Record<string, unknown> = {};

	if (Object.hasOwn(updates, "googleEventId")) {
		payload.googleEventId = updates.googleEventId ?? null;
	}
	if (Object.hasOwn(updates, "status")) {
		payload.status = updates.status ?? eventCalendarSyncStatus.enumValues[0];
	}
	if (Object.hasOwn(updates, "lastSyncedAt")) {
		payload.lastSyncedAt = updates.lastSyncedAt ?? null;
	}
	if (Object.hasOwn(updates, "failureReason")) {
		payload.failureReason = updates.failureReason ?? null;
	}

	await db
		.update(eventCalendarSync)
		.set(payload)
		.where(buildSyncConditions(eventId, memberId));
}

export async function syncEventWithGoogleCalendar(
	eventId: string,
	options: SyncEventOptions = {},
): Promise<SyncAction> {
	const rows = await db
		.select({
			id: event.id,
			title: event.title,
			description: event.description,
			location: event.location,
			slug: event.slug,
			startAt: event.startAt,
			endAt: event.endAt,
			isAllDay: event.isAllDay,
			isPublished: event.isPublished,
			status: event.status,
			metadata: event.metadata,
			organizationId: event.organizationId,
		})
		.from(event)
		.where(eq(event.id, eventId))
		.limit(1);

	const current = rows.at(0) as EventRow | undefined;
	if (!current) {
		return "skipped";
	}

	if (!current.organizationId) {
		if (options.memberId) {
			await updateSyncRecord(current.id, options.memberId, {
				status: "pending",
				failureReason: "Event is not associated with an organization",
			});
		}
		return "skipped";
	}

	const calendarConfig = await resolveOrganizationCalendar(
		current.organizationId,
		options.memberId,
	);

	type CalendarContext = {
		type: "service-account" | "organization-oauth" | "user";
		calendarId: string;
		client: calendar_v3.Calendar | null;
		syncMemberId: string | null;
		handleSuccess?: () => Promise<void>;
		handleError?: (error: unknown) => Promise<void>;
	};

	let context: CalendarContext | null = null;

	if (calendarConfig) {
		if (
			calendarConfig.type === "service-account" &&
			!isGoogleCalendarConfigured()
		) {
			throw new Error("Google Calendar integration is not configured");
		}

		if (calendarConfig.type === "oauth") {
			const syncMemberId =
				options.memberId ?? calendarConfig.connection.memberId;

			const oauthContext = await (async () => {
				try {
					return await getOAuthCalendarClient({
						redirectUri: buildAbsoluteUrl(
							"/api/integrations/google-calendar/callback",
						),
						stored: calendarConfig.credentials,
					});
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Unable to refresh Google Calendar credentials";
					await markConnectionStatus(
						calendarConfig.connection.id,
						"error",
						message,
					);
					throw error;
				}
			})();

			const handleSuccess = async () => {
				if (oauthContext?.refreshedCredentials) {
					await updateConnectionCredentials(
						calendarConfig.connection,
						oauthContext.refreshedCredentials,
					);
				}
				await touchConnectionSynced(calendarConfig.connection.id);
			};

			const handleError = async (error: unknown) => {
				const message =
					(error as { response?: { data?: { error?: string } } })?.response
						?.data?.error ||
					(error instanceof Error ? error.message : "Unknown error");
				await markConnectionStatus(
					calendarConfig.connection.id,
					"error",
					message,
				);
				if (message && /invalid_grant/i.test(message)) {
					await clearConnectionCredentials(calendarConfig.connection.id);
				}
			};

			context = {
				type: "organization-oauth",
				calendarId: calendarConfig.calendarId,
				client: oauthContext.client,
				syncMemberId,
				handleSuccess,
				handleError,
			} satisfies CalendarContext;
		} else {
			context = {
				type: "service-account",
				calendarId: calendarConfig.calendarId,
				client: null,
				syncMemberId: options.memberId ?? null,
			} satisfies CalendarContext;
		}
	} else {
		if (!options.userId) {
			throw new CalendarSyncUnavailableError(
				"organization",
				"Organization is not linked to a Google Calendar",
			);
		}

		if (!options.memberId) {
			throw new CalendarSyncUnavailableError(
				"user",
				"Member identifier is required to sync a personal calendar",
			);
		}

		try {
			const { calendar } = await getCalendarClientForUser(options.userId);
			context = {
				type: "user",
				calendarId: "primary",
				client: calendar,
				syncMemberId: options.memberId,
			} satisfies CalendarContext;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error ?? "");
			if (message.toLowerCase().includes("no linked google account")) {
				throw new CalendarSyncUnavailableError(
					"user",
					"Personal Google calendar is not connected",
				);
			}
			throw error;
		}
	}

	if (!context) {
		throw new CalendarSyncUnavailableError(
			"organization",
			"Organization is not linked to a Google Calendar",
		);
	}

	const syncMemberId = context.syncMemberId ?? null;
	const syncRecord = await ensureSyncRecord(current.id, syncMemberId);
	const existingEventId = syncRecord?.googleEventId ?? null;

	const markFailure = async (error: unknown) => {
		const message =
			error instanceof Error ? error.message : "Unknown calendar sync error";
		await updateSyncRecord(current.id, syncMemberId, {
			status: "failed",
			failureReason: message,
		});
		await context.handleError?.(error);
	};

	const markSuccess = async (
		updates: Partial<Pick<EventCalendarSyncRow, "googleEventId">>,
	) => {
		await updateSyncRecord(current.id, syncMemberId, {
			...updates,
			status: "synced",
			lastSyncedAt: new Date(),
			failureReason: null,
		});
		await context.handleSuccess?.();
	};

	if (current.status !== "approved" || !current.isPublished) {
		if (!existingEventId) {
			await updateSyncRecord(current.id, syncMemberId, {
				status: "pending",
				failureReason: null,
			});
			return "skipped";
		}

		try {
			await deleteGoogleCalendarEvent({
				calendarId: context.calendarId,
				eventId: existingEventId,
				client: context.client ?? undefined,
			});
			await markSuccess({ googleEventId: null });
		} catch (error) {
			await markFailure(error);
			throw error;
		}

		return "deleted";
	}

	let googleEventId: string;

	try {
		googleEventId = await upsertGoogleCalendarEvent({
			calendarId: context.calendarId,
			existingEventId,
			event: toGoogleCalendarInput(current),
			client: context.client ?? undefined,
		});
		await markSuccess({ googleEventId });
	} catch (error) {
		await markFailure(error);
		throw error;
	}

	return existingEventId ? "updated" : "created";
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
			const [eventRow] = await db
				.select({ organizationId: event.organizationId })
				.from(event)
				.where(eq(event.id, claimed.eventId))
				.limit(1);

			const organizationId = eventRow?.organizationId ?? null;

			let targets: Array<string | null> = [null];

			if (organizationId) {
				const connections = await db
					.select({ memberId: calendarConnection.memberId })
					.from(calendarConnection)
					.innerJoin(member, eq(member.id, calendarConnection.memberId))
					.where(
						and(
							eq(member.organizationId, organizationId),
							eq(calendarConnection.providerType, "google"),
							eq(calendarConnection.status, "connected"),
						),
					);

				if (connections.length > 0) {
					targets = Array.from(new Set(connections.map((row) => row.memberId)));
				}
			}

			let hadError = false;
			const errorMessages: string[] = [];

			for (const memberId of targets) {
				try {
					const action = await syncEventWithGoogleCalendar(
						claimed.eventId,
						memberId ? { memberId } : {},
					);

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
				} catch (error) {
					hadError = true;
					const message =
						error instanceof Error
							? error.message
							: "Unknown calendar sync error";
					errorMessages.push(message);
				}
			}

			if (hadError) {
				summary.failed += 1;
				const message = errorMessages.at(0) ?? "Unknown calendar sync error";
				await db
					.update(eventAutomationJob)
					.set({ status: "failed", lastError: message })
					.where(eq(eventAutomationJob.id, job.id));
			} else {
				await db
					.update(eventAutomationJob)
					.set({ status: "completed", lastError: null })
					.where(eq(eventAutomationJob.id, job.id));
			}
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
