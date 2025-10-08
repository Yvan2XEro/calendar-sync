import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { digestSchedule } from "@/db/schema/app";
import {
	DEFAULT_DIGEST_CADENCE_HOURS,
	DEFAULT_DIGEST_LOOKAHEAD_DAYS,
	DIGEST_SEGMENTS,
	type DigestSegmentValue,
} from "@/lib/mailer/digest";
import { adminProcedure, router } from "@/lib/trpc";

const segmentSchema = z.enum(
	DIGEST_SEGMENTS as [DigestSegmentValue, ...DigestSegmentValue[]],
);

const updateSchema = z.object({
	segment: segmentSchema,
	enabled: z.boolean(),
	cadenceHours: z
		.number()
		.int()
		.min(6, "Cadence must be at least 6 hours")
		.max(24 * 24, "Cadence cannot exceed 24 days"),
	lookaheadDays: z
		.number()
		.int()
		.min(1, "Lookahead must be at least 1 day")
		.max(90, "Lookahead cannot exceed 90 days"),
});

type ScheduleRecord = typeof digestSchedule.$inferSelect;

type ScheduleEntity = {
	id: string;
	segment: DigestSegmentValue;
	enabled: boolean;
	cadenceHours: number;
	lookaheadDays: number;
	lastSentAt: string | null;
	metadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
};

async function fetchScheduleBySegment(
	segment: DigestSegmentValue,
): Promise<ScheduleRecord | null> {
	const rows = await db
		.select()
		.from(digestSchedule)
		.where(eq(digestSchedule.segment, segment))
		.limit(1);
	return rows.at(0) ?? null;
}

async function ensureSchedule(
	segment: DigestSegmentValue,
): Promise<ScheduleRecord> {
	const existing = await fetchScheduleBySegment(segment);
	if (existing) {
		return existing;
	}
	const now = new Date();
	const [created] = await db
		.insert(digestSchedule)
		.values({
			id: randomUUID(),
			segment,
			enabled: false,
			cadenceHours: DEFAULT_DIGEST_CADENCE_HOURS,
			lookaheadDays: DEFAULT_DIGEST_LOOKAHEAD_DAYS,
			metadata: {},
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({ target: digestSchedule.segment })
		.returning();
	if (created) {
		return created;
	}
	const existingAfterInsert = await fetchScheduleBySegment(segment);
	if (existingAfterInsert) {
		return existingAfterInsert;
	}
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "Unable to create digest schedule",
	});
}

function mapSchedule(record: ScheduleRecord): ScheduleEntity {
	return {
		id: record.id,
		segment: record.segment,
		enabled: record.enabled,
		cadenceHours: record.cadenceHours,
		lookaheadDays: record.lookaheadDays,
		lastSentAt: record.lastSentAt?.toISOString() ?? null,
		metadata: (record.metadata ?? {}) as Record<string, unknown>,
		createdAt: record.createdAt?.toISOString?.() ?? new Date().toISOString(),
		updatedAt: record.updatedAt?.toISOString?.() ?? new Date().toISOString(),
	} satisfies ScheduleEntity;
}

async function loadAllSchedules(): Promise<ScheduleRecord[]> {
	const records = await db
		.select()
		.from(digestSchedule)
		.orderBy(asc(digestSchedule.segment));
	const foundSegments = new Set(records.map((item) => item.segment));
	if (foundSegments.size === DIGEST_SEGMENTS.length) {
		return records;
	}

	const created: ScheduleRecord[] = [...records];
	for (const segment of DIGEST_SEGMENTS) {
		if (!foundSegments.has(segment)) {
			created.push(await ensureSchedule(segment));
		}
	}

	return created.sort(
		(a, b) =>
			DIGEST_SEGMENTS.indexOf(a.segment) - DIGEST_SEGMENTS.indexOf(b.segment),
	);
}

export const adminDigestsRouter = router({
	listSchedules: adminProcedure.query(async () => {
		const rows = await loadAllSchedules();
		return rows.map(mapSchedule);
	}),
	updateSchedule: adminProcedure
		.input(updateSchema)
		.mutation(async ({ input }) => {
			await ensureSchedule(input.segment);
			const [updated] = await db
				.update(digestSchedule)
				.set({
					enabled: input.enabled,
					cadenceHours: input.cadenceHours,
					lookaheadDays: input.lookaheadDays,
					updatedAt: new Date(),
				})
				.where(eq(digestSchedule.segment, input.segment))
				.returning();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Schedule not found",
				});
			}
			return mapSchedule(updated);
		}),
});
