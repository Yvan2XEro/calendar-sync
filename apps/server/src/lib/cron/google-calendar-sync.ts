import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { calendar_v3 } from "googleapis";
import { z } from "zod";

import { db } from "@/db";
import { event } from "@/db/schema/app";
import { account } from "@/db/schema/auth";
import {
        buildEventResource,
        type GoogleCalendarEventInput,
        isNotFoundError,
} from "@/lib/integrations/google-calendar";
import { getCalendarClientForUser } from "@/lib/google-calendar";

const DEFAULT_EVENT_LIMIT = 50;
const DEFAULT_LOOKAHEAD_HOURS = 24 * 30;
const USER_CALENDAR_ID = "primary";

const syncOptionsSchema = z
        .object({
                limit: z.number().int().min(1).max(200).optional(),
                lookaheadHours: z.number().int().min(1).max(24 * 365).optional(),
        })
        .partial();

type EventSelection = {
        id: string;
        title: string;
        description: string | null;
        location: string | null;
        url: string | null;
        startAt: Date;
        endAt: Date | null;
        isAllDay: boolean;
        metadata: Record<string, unknown> | null;
};

type SyncAction = "created" | "updated";

type SyncError = {
        userId: string;
        eventId?: string;
        message: string;
};

export type SyncSummary = {
        accountsProcessed: number;
        accountsSucceeded: number;
        accountsFailed: number;
        eventsConsidered: number;
        created: number;
        updated: number;
        skipped: number;
};

export type SyncResult = {
        summary: SyncSummary;
        errors: SyncError[];
};

export type SyncOptions = z.infer<typeof syncOptionsSchema>;

function normalizeMetadata(
        value: EventSelection["metadata"],
): Record<string, unknown> | undefined {
        if (!value) return undefined;
        if (typeof value !== "object" || Array.isArray(value)) return undefined;
        return value;
}

function toGoogleInput(row: EventSelection): GoogleCalendarEventInput {
        return {
                id: row.id,
                title: row.title,
                startAt: row.startAt,
                endAt: row.endAt,
                isAllDay: row.isAllDay,
                description: row.description ?? undefined,
                location: row.location ?? undefined,
                url: row.url ?? undefined,
                metadata: normalizeMetadata(row.metadata),
        } satisfies GoogleCalendarEventInput;
}

function isConflictError(error: unknown): boolean {
        const maybeCode = (error as { code?: number }).code;
        if (maybeCode === 409) return true;
        const maybeStatus = (error as { status?: number }).status;
        if (maybeStatus === 409) return true;
        const responseStatus = (error as { response?: { status?: number } }).response?.status;
        return responseStatus === 409;
}

async function syncEventForUser(
        calendar: calendar_v3.Calendar,
        eventInput: GoogleCalendarEventInput,
): Promise<SyncAction> {
        const resource = buildEventResource(eventInput);

        try {
                await calendar.events.patch({
                        calendarId: USER_CALENDAR_ID,
                        eventId: eventInput.id,
                        requestBody: resource,
                });
                return "updated";
        } catch (error) {
                if (!isNotFoundError(error)) {
                        throw error;
                }
        }

        try {
                await calendar.events.insert({
                        calendarId: USER_CALENDAR_ID,
                        requestBody: { ...resource, id: eventInput.id },
                });
                return "created";
        } catch (error) {
                if (isConflictError(error)) {
                        await calendar.events.patch({
                                calendarId: USER_CALENDAR_ID,
                                eventId: eventInput.id,
                                requestBody: resource,
                        });
                        return "updated";
                }
                throw error;
        }
}

export async function syncGoogleCalendars(options?: SyncOptions): Promise<SyncResult> {
        const parsed = syncOptionsSchema.parse(options ?? {});

        const limit = parsed.limit ?? DEFAULT_EVENT_LIMIT;
        const lookaheadHours = parsed.lookaheadHours ?? DEFAULT_LOOKAHEAD_HOURS;

        const now = new Date();
        const lookahead = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);

        const eventsToSync = await db
                .select({
                        id: event.id,
                        title: event.title,
                        description: event.description,
                        location: event.location,
                        url: event.url,
                        startAt: event.startAt,
                        endAt: event.endAt,
                        isAllDay: event.isAllDay,
                        metadata: event.metadata,
                })
                .from(event)
                .where(
                        and(
                                eq(event.status, "approved"),
                                eq(event.isPublished, true),
                                gte(event.startAt, now),
                                lte(event.startAt, lookahead),
                        ),
                )
                .orderBy(asc(event.startAt))
                .limit(limit);

        const googleAccounts = await db
                .select({
                        id: account.id,
                        userId: account.userId,
                })
                .from(account)
                .where(eq(account.providerId, "google"));

        const summary: SyncSummary = {
                accountsProcessed: googleAccounts.length,
                accountsSucceeded: 0,
                accountsFailed: 0,
                eventsConsidered: eventsToSync.length,
                created: 0,
                updated: 0,
                skipped: 0,
        };

        const errors: SyncError[] = [];

        if (googleAccounts.length === 0 || eventsToSync.length === 0) {
                return { summary, errors };
        }

        for (const acct of googleAccounts) {
                try {
                        const { calendar } = await getCalendarClientForUser(acct.userId);
                        for (const row of eventsToSync) {
                                const eventInput = toGoogleInput(row);
                                try {
                                        const action = await syncEventForUser(calendar, eventInput);
                                        if (action === "created") {
                                                summary.created += 1;
                                        } else {
                                                summary.updated += 1;
                                        }
                                } catch (error) {
                                        summary.skipped += 1;
                                        const message =
                                                error instanceof Error
                                                        ? error.message
                                                        : "Failed to sync event to Google Calendar";
                                        errors.push({ userId: acct.userId, eventId: row.id, message });
                                }
                        }
                        summary.accountsSucceeded += 1;
                } catch (error) {
                        summary.accountsFailed += 1;
                        const message =
                                error instanceof Error
                                        ? error.message
                                        : "Unable to initialize Google Calendar client";
                        errors.push({ userId: acct.userId, message });
                }
        }

        return { summary, errors };
}
