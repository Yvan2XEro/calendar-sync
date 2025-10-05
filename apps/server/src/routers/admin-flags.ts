import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { flag } from "@/db/schema/app";
import { adminProcedure, router } from "@/lib/trpc";

const baseFlagSchema = z.object({
	label: z.string().trim().min(1, "Label is required"),
	slug: z.string().trim().min(1, "Slug is required"),
	description: z.string().trim().optional(),
	priority: z
		.number({ error: "Priority is required" })
		.int("Priority must be an integer")
		.min(1, "Priority must be between 1 and 5")
		.max(5, "Priority must be between 1 and 5"),
});

const getFlagByIdInput = z.object({
	id: z.string().min(1, "Flag id is required"),
});

type FlagRecord = typeof flag.$inferSelect;

type FlagEntity = {
	id: string;
	label: string;
	slug: string;
	description: string | null;
	priority: number;
	createdAt: string;
	updatedAt: string;
};

function normalizeSlug(slugValue: string) {
	return slugValue.trim().toLowerCase();
}

function normalizeDescription(description?: string) {
	if (!description) return null;
	const trimmed = description.trim();
	return trimmed.length ? trimmed : null;
}

function mapFlag(record: FlagRecord): FlagEntity {
	return {
		id: record.id,
		label: record.label,
		slug: record.slug,
		description: record.description ?? null,
		priority: record.priority,
		createdAt: record.createdAt?.toISOString?.() ?? new Date().toISOString(),
		updatedAt: record.updatedAt?.toISOString?.() ?? new Date().toISOString(),
	};
}

async function ensureSlugAvailable(slugValue: string, ignoreId?: string) {
	const existing = await db.query.flag.findFirst({
		where: eq(flag.slug, slugValue),
	});

	if (existing && existing.id !== ignoreId) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "A flag with this slug already exists",
		});
	}
}

export const adminFlagsRouter = router({
	listFlags: adminProcedure.query(async () => {
		const rows = await db.select().from(flag).orderBy(desc(flag.createdAt));
		return rows.map(mapFlag);
	}),
	getFlag: adminProcedure.input(getFlagByIdInput).query(async ({ input }) => {
		const record = await db.query.flag.findFirst({
			where: eq(flag.id, input.id),
		});

		if (!record) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Flag not found",
			});
		}

		return mapFlag(record);
	}),
	createFlag: adminProcedure
		.input(baseFlagSchema)
		.mutation(async ({ input }) => {
			const normalizedSlug = normalizeSlug(input.slug);
			await ensureSlugAvailable(normalizedSlug);

			const [created] = await db
				.insert(flag)
				.values({
					id: randomUUID(),
					label: input.label.trim(),
					slug: normalizedSlug,
					description: normalizeDescription(input.description),
					priority: input.priority,
				})
				.returning();

			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to create flag",
				});
			}

			return mapFlag(created);
		}),
	updateFlag: adminProcedure
		.input(
			baseFlagSchema.extend({ id: z.string().min(1, "Flag id is required") }),
		)
		.mutation(async ({ input }) => {
			const normalizedSlug = normalizeSlug(input.slug);
			const existing = await db.query.flag.findFirst({
				where: eq(flag.id, input.id),
			});

			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Flag not found",
				});
			}

			await ensureSlugAvailable(normalizedSlug, input.id);

			const [updated] = await db
				.update(flag)
				.set({
					label: input.label.trim(),
					slug: normalizedSlug,
					description: normalizeDescription(input.description),
					priority: input.priority,
					updatedAt: new Date(),
				})
				.where(eq(flag.id, input.id))
				.returning();

			if (!updated) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to update flag",
				});
			}

			return mapFlag(updated);
		}),
	deleteFlag: adminProcedure
		.input(getFlagByIdInput)
		.mutation(async ({ input }) => {
			const [deleted] = await db
				.delete(flag)
				.where(eq(flag.id, input.id))
				.returning();

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Flag not found",
				});
			}

			return mapFlag(deleted);
		}),
});
