import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import {
        and,
        count,
        desc,
        eq,
        gte,
        ilike,
        inArray,
        isNull,
        lte,
        or,
        type SQL,
        sql,
} from "drizzle-orm";
import { PostgresError } from "postgres";
import { z } from "zod";

import { db } from "@/db";
import { event, flag, organizationProvider, provider } from "@/db/schema/app";
import { member, organization } from "@/db/schema/auth";
import {
        parseHeroMedia,
        parseLandingPage,
        type EventHeroMedia,
        type EventLandingPageContent,
} from "@/lib/event-content";
import { adminProcedure, protectedProcedure, router } from "@/lib/trpc";

const DEFAULT_PAGE_SIZE = 25;

const filterSchema = z.object({
	providerId: z.string().min(1).optional(),
	status: z.enum(event.status.enumValues).optional(),
	flagId: z.union([z.string().min(1), z.literal(null)]).optional(),
	isPublished: z.boolean().optional(),
	isAllDay: z.boolean().optional(),
	q: z.string().trim().min(1).optional(),
	startFrom: z
		.string()
		.datetime({ offset: true })
		.transform((value) => new Date(value))
		.optional(),
	startTo: z
		.string()
		.datetime({ offset: true })
		.transform((value) => new Date(value))
		.optional(),
	priority: z
		.object({
			min: z.number().int().min(1).max(5).optional(),
			max: z.number().int().min(1).max(5).optional(),
		})
		.refine(
			(range) =>
				range.min === undefined ||
				range.max === undefined ||
				range.min <= range.max,
		)
		.optional(),
});

type EventFilterInput = z.infer<typeof filterSchema>;

type EventSelection = {
        id: string;
        slug: string;
        providerId: string;
        flagId: string | null;
        title: string;
        description: string | null;
        location: string | null;
        url: string | null;
        heroMedia: Record<string, unknown> | null;
        landingPage: Record<string, unknown> | null;
        startAt: Date;
        endAt: Date | null;
        isAllDay: boolean;
        isPublished: boolean;
        externalId: string | null;
	metadata: Record<string, unknown> | null;
	status: (typeof event.status.enumValues)[number];
	priority: number;
	createdAt: Date;
	updatedAt: Date;
	providerName: string | null;
	providerCategory: string | null;
	providerStatus: (typeof provider.status.enumValues)[number] | null;
	flagLabel: string | null;
	flagPriority: number | null;
};

type AutoApprovalInfo = {
	reason: string;
	providerId: string | null;
	at: string | null;
	trustedProvider: boolean;
};

function parseAutoApproval(
        metadata: Record<string, unknown> | null | undefined,
): AutoApprovalInfo | null {
        if (!metadata) return null;
        const raw = metadata.auto_approval;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

	const info = raw as Record<string, unknown>;
	const reason = typeof info.reason === "string" ? info.reason : null;
	if (!reason) return null;

	const providerId =
		typeof info.provider_id === "string" ? info.provider_id : null;
	const at = typeof info.at === "string" ? info.at : null;

	return {
		reason,
		providerId,
		at,
		trustedProvider: reason === "trusted_provider",
	} satisfies AutoApprovalInfo;
}

const slugSchema = z
        .string()
        .trim()
        .min(1, "Slug is required")
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
                message: "Use lowercase letters, numbers, and hyphens only",
        });

const heroMediaSchema = z
        .object({
                type: z.enum(["image", "video"]).optional(),
                url: z
                        .string()
                        .trim()
                        .url({ message: "Enter a valid URL" })
                        .optional(),
                alt: z.string().trim().optional(),
                posterUrl: z
                        .string()
                        .trim()
                        .url({ message: "Enter a valid poster URL" })
                        .optional(),
        })
        .superRefine((value, ctx) => {
                if (value.type && !value.url) {
                        ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                path: ["url"],
                                message: "Provide a URL for the selected media type",
                        });
                }
                if (value.posterUrl && value.type !== "video") {
                        ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                path: ["posterUrl"],
                                message: "Poster images are only supported for videos",
                        });
                }
        });

const landingPageSchema = z.object({
        headline: z.string().trim().optional(),
        subheadline: z.string().trim().optional(),
        body: z.string().trim().optional(),
        seoDescription: z.string().trim().optional(),
        cta: z
                .object({
                        label: z.string().trim().optional(),
                        href: z
                                .string()
                                .trim()
                                .url({ message: "Enter a valid CTA URL" })
                                .optional(),
                })
                .optional(),
});

type HeroMediaInput = z.infer<typeof heroMediaSchema>;
type LandingPageInput = z.infer<typeof landingPageSchema>;

function trimmedOrUndefined(value: string | null | undefined) {
        const trimmed = value?.trim();
        return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeHeroMediaInput(value: HeroMediaInput | undefined) {
        if (!value) return {} as EventHeroMedia;
        const url = trimmedOrUndefined(value.url ?? undefined);
        const type = value.type && url ? value.type : undefined;
        const alt = trimmedOrUndefined(value.alt ?? undefined);
        const posterUrl =
                type === "video" ? trimmedOrUndefined(value.posterUrl ?? undefined) : undefined;

        const next: EventHeroMedia = {};
        if (url) next.url = url;
        if (type) next.type = type;
        if (alt) next.alt = alt;
        if (posterUrl) next.posterUrl = posterUrl;

        return next;
}

function normalizeLandingPageInput(value: LandingPageInput | undefined) {
        if (!value) return {} as EventLandingPageContent;
        const headline = trimmedOrUndefined(value.headline ?? undefined);
        const subheadline = trimmedOrUndefined(value.subheadline ?? undefined);
        const body = trimmedOrUndefined(value.body ?? undefined);
        const seoDescription = trimmedOrUndefined(value.seoDescription ?? undefined);

        const ctaLabel = trimmedOrUndefined(value.cta?.label ?? undefined);
        const ctaHref = trimmedOrUndefined(value.cta?.href ?? undefined);

        const next: EventLandingPageContent = {};
        if (headline) next.headline = headline;
        if (subheadline) next.subheadline = subheadline;
        if (body) next.body = body;
        if (seoDescription) next.seoDescription = seoDescription;
        if (ctaLabel || ctaHref) {
                next.cta = {};
                if (ctaLabel) next.cta.label = ctaLabel;
                if (ctaHref) next.cta.href = ctaHref;
        }

        return next;
}

function isUniqueViolation(error: unknown) {
        return error instanceof PostgresError && error.code === "23505";
}

const listInputSchema = filterSchema.extend({
	page: z.number().int().min(1).optional(),
	limit: z.number().int().min(1).max(200).optional(),
});

type ListInput = z.infer<typeof listInputSchema>;

const getEventInput = z.object({
	id: z.string().min(1),
});

const updateStatusInput = z.object({
	id: z.string().min(1),
	status: z.enum(event.status.enumValues),
});

const bulkUpdateStatusInput = z.object({
	ids: z.array(z.string().min(1)).min(1),
	status: z.enum(event.status.enumValues),
});

const updateEventInput = z
        .object({
                id: z.string().min(1),
                title: z.string().trim().min(1).optional(),
                slug: slugSchema.optional(),
                description: z
                        .string()
                        .trim()
                        .transform((value) => (value.length === 0 ? null : value))
                        .nullable()
                        .optional(),
		location: z
			.string()
			.trim()
			.transform((value) => (value.length === 0 ? null : value))
			.nullable()
			.optional(),
		url: z.string().trim().url().nullable().optional(),
		startAt: z
			.string()
			.datetime({ offset: true })
			.transform((value) => new Date(value))
			.optional(),
		endAt: z
			.union([
				z
					.string()
					.datetime({ offset: true })
					.transform((value) => new Date(value)),
				z.null(),
			])
			.optional(),
		isAllDay: z.boolean().optional(),
		isPublished: z.boolean().optional(),
		externalId: z
			.string()
			.trim()
			.transform((value) => (value.length === 0 ? null : value))
			.nullable()
			.optional(),
                flagId: z.union([z.string().min(1), z.null()]).optional(),
                providerId: z.string().min(1).optional(),
                priority: z.number().int().min(1).max(5).optional(),
                metadata: z.record(z.string(), z.unknown()).optional(),
                heroMedia: heroMediaSchema.optional(),
                landingPage: landingPageSchema.optional(),
        })
        .refine(
                (data) =>
                        !(data.startAt && data.endAt instanceof Date) ||
                        data.endAt.getTime() >= data.startAt.getTime(),
		{
			message: "End time must be after start time",
			path: ["endAt"],
		},
	);

const statsInputSchema = filterSchema;

const RECENT_EVENTS_DEFAULT_LIMIT = 8;
const RECENT_EVENTS_MAX_LIMIT = 500;
const RECENT_EVENTS_WINDOW_DAYS = 30;

const recentEventsInput = z
        .object({
                limit: z.number().int().min(1).max(RECENT_EVENTS_MAX_LIMIT).optional(),
        })
        .optional();

const createEventInput = z
        .object({
                title: z.string().trim().min(1),
                slug: slugSchema,
                description: z
                        .string()
                        .trim()
                        .transform((value) => (value.length === 0 ? null : value))
                        .nullable()
                        .optional(),
                location: z
                        .string()
                        .trim()
                        .transform((value) => (value.length === 0 ? null : value))
                        .nullable()
                        .optional(),
                url: z.string().trim().url().nullable().optional(),
                startAt: z
                        .string()
                        .datetime({ offset: true })
                        .transform((value) => new Date(value)),
                endAt: z
                        .union([
                                z
                                        .string()
                                        .datetime({ offset: true })
                                        .transform((value) => new Date(value)),
                                z.null(),
                                z.undefined(),
                        ])
                        .optional(),
                isAllDay: z.boolean().optional().default(false),
                isPublished: z.boolean().optional().default(false),
                externalId: z
                        .string()
                        .trim()
                        .transform((value) => (value.length === 0 ? null : value))
                        .nullable()
                        .optional(),
                flagId: z.union([z.string().min(1), z.null()]).optional(),
                providerId: z.string().min(1),
                priority: z.number().int().min(1).max(5).default(3),
                metadata: z.record(z.string(), z.unknown()).optional(),
                heroMedia: heroMediaSchema.optional(),
                landingPage: landingPageSchema.optional(),
        })
        .refine(
                (data) =>
                        !(data.startAt && data.endAt instanceof Date) ||
                        data.endAt.getTime() >= data.startAt.getTime(),
                {
                        message: "End time must be after start time",
                        path: ["endAt"],
                },
        );

const deleteEventInput = z.object({ id: z.string().min(1) });

const eventSelection = {
        id: event.id,
        slug: event.slug,
        providerId: event.provider,
        flagId: event.flag,
        title: event.title,
        description: event.description,
        location: event.location,
        url: event.url,
        heroMedia: event.heroMedia,
        landingPage: event.landingPage,
        startAt: event.startAt,
        endAt: event.endAt,
        isAllDay: event.isAllDay,
        isPublished: event.isPublished,
	externalId: event.externalId,
	metadata: event.metadata,
	status: event.status,
	priority: event.priority,
	createdAt: event.createdAt,
	updatedAt: event.updatedAt,
	providerName: provider.name,
	providerCategory: provider.category,
	providerStatus: provider.status,
	flagLabel: flag.label,
	flagPriority: flag.priority,
};

function buildEventFilters(filters: EventFilterInput): SQL[] {
	const clauses: SQL[] = [];

	if (filters.providerId) {
		clauses.push(eq(event.provider, filters.providerId));
	}

	if (filters.status) {
		clauses.push(eq(event.status, filters.status));
	}

	if (filters.flagId !== undefined) {
		if (filters.flagId === null) {
			clauses.push(isNull(event.flag));
		} else {
			clauses.push(eq(event.flag, filters.flagId));
		}
	}

	if (filters.isPublished !== undefined) {
		clauses.push(eq(event.isPublished, filters.isPublished));
	}

	if (filters.isAllDay !== undefined) {
		clauses.push(eq(event.isAllDay, filters.isAllDay));
	}

	if (filters.startFrom) {
		clauses.push(gte(event.startAt, filters.startFrom));
	}

	if (filters.startTo) {
		clauses.push(lte(event.startAt, filters.startTo));
	}

	if (filters.priority) {
		if (filters.priority.min !== undefined) {
			clauses.push(gte(event.priority, filters.priority.min));
		}
		if (filters.priority.max !== undefined) {
			clauses.push(lte(event.priority, filters.priority.max));
		}
	}

	if (filters.q) {
		const term = `%${filters.q}%`;
		const searchClause = or(
			ilike(event.title, term),
			ilike(event.description, term),
			ilike(event.location, term),
		);
		if (searchClause) {
			clauses.push(searchClause);
		}
	}

	return clauses;
}

function mapEvent(row: EventSelection) {
	const metadata = (row.metadata ?? {}) as Record<string, unknown>;
	const autoApproval = parseAutoApproval(metadata);

        return {
                id: row.id,
                slug: row.slug,
                providerId: row.providerId,
                flagId: row.flagId,
                title: row.title,
                description: row.description,
                location: row.location,
                url: row.url,
                heroMedia: parseHeroMedia(row.heroMedia),
                landingPage: parseLandingPage(row.landingPage),
                startAt: row.startAt,
                endAt: row.endAt,
                isAllDay: row.isAllDay,
                isPublished: row.isPublished,
                externalId: row.externalId,
		metadata,
		autoApproval,
		status: row.status,
		priority: row.priority,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		provider: row.providerName
			? {
					id: row.providerId,
					name: row.providerName,
					category: row.providerCategory,
					status: row.providerStatus,
				}
			: null,
		flag: row.flagId
			? {
					id: row.flagId,
					label: row.flagLabel,
					priority: row.flagPriority,
				}
			: null,
	} as const;
}

async function fetchEventOrThrow(id: string) {
	const rows = await db
		.select(eventSelection)
		.from(event)
		.leftJoin(provider, eq(provider.id, event.provider))
		.leftJoin(flag, eq(flag.id, event.flag))
		.where(eq(event.id, id))
		.limit(1);

	const row = rows.at(0);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
	}

	return mapEvent(row as EventSelection);
}

export const eventsRouter = router({
	listRecentForUser: protectedProcedure
		.input(recentEventsInput)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const limit = input?.limit ?? RECENT_EVENTS_DEFAULT_LIMIT;

			const now = new Date();
			const windowEnd = new Date(
				now.getTime() + RECENT_EVENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
			);

                        const rows = await db
                                .select({
                                        id: event.id,
                                        slug: event.slug,
                                        title: event.title,
                                        description: event.description,
                                        location: event.location,
                                        url: event.url,
                                        heroMedia: event.heroMedia,
                                        landingPage: event.landingPage,
                                        startAt: event.startAt,
                                        endAt: event.endAt,
                                        metadata: event.metadata,
                                        organizationId: organization.id,
                                        organizationName: organization.name,
					organizationSlug: organization.slug,
					providerName: provider.name,
				})
				.from(event)
				.innerJoin(provider, eq(provider.id, event.provider))
				.innerJoin(
					organizationProvider,
					eq(organizationProvider.providerId, provider.id),
				)
				.innerJoin(
					organization,
					eq(organization.id, organizationProvider.organizationId),
				)
				.innerJoin(
					member,
					and(
						eq(member.organizationId, organization.id),
						eq(member.userId, userId),
					),
				)
				.where(
					and(
						eq(event.status, "approved"),
						eq(event.isPublished, true),
						gte(event.startAt, now),
						lte(event.startAt, windowEnd),
					),
				)
				.orderBy(event.startAt, event.id)
				.limit(limit);

                        return rows.map((row) => ({
                                id: row.id,
                                slug: row.slug,
                                title: row.title,
                                description: row.description,
                                location: row.location,
                                url: row.url,
                                heroMedia: parseHeroMedia(row.heroMedia),
                                landingPage: parseLandingPage(row.landingPage),
                                startAt: row.startAt,
                                endAt: row.endAt,
                                organization: {
                                        id: row.organizationId,
                                        name: row.organizationName,
					slug: row.organizationSlug,
				},
				providerName: row.providerName,
				imageUrl:
					typeof row.metadata?.imageUrl === "string"
						? (row.metadata.imageUrl as string)
						: null,
			}));
		}),
	list: adminProcedure
		.input(listInputSchema.optional())
		.query(async ({ input }) => {
			const filters: ListInput = { ...(input ?? {}) };
			const {
				page: requestedPage,
				limit: requestedLimit,
				...restFilters
			} = filters;
			const page = requestedPage ?? 1;
			const limit = requestedLimit ?? DEFAULT_PAGE_SIZE;

			const whereClauses = buildEventFilters(restFilters as EventFilterInput);
			const whereCondition =
				whereClauses.length > 0 ? and(...whereClauses) : undefined;

			const [totalResult, rows] = await Promise.all([
				db.select({ value: count() }).from(event).where(whereCondition),
				db
					.select(eventSelection)
					.from(event)
					.leftJoin(provider, eq(provider.id, event.provider))
					.leftJoin(flag, eq(flag.id, event.flag))
					.where(whereCondition)
					.orderBy(desc(event.startAt), desc(event.createdAt), desc(event.id))
					.offset((page - 1) * limit)
					.limit(limit),
			]);

			const total = Number(totalResult.at(0)?.value ?? 0);
			const items = rows.map((row) => mapEvent(row as EventSelection));

			return {
				items,
				total,
				page,
				limit,
			} as const;
		}),
	get: adminProcedure.input(getEventInput).query(async ({ input }) => {
		return fetchEventOrThrow(input.id);
	}),
	updateStatus: adminProcedure
		.input(updateStatusInput)
		.mutation(async ({ input }) => {
			const [updated] = await db
				.update(event)
				.set({ status: input.status, updatedAt: sql`now()` })
				.where(eq(event.id, input.id))
				.returning({ id: event.id });

			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			return fetchEventOrThrow(updated.id);
		}),
        bulkUpdateStatus: adminProcedure
                .input(bulkUpdateStatusInput)
                .mutation(async ({ input }) => {
                        const ids = Array.from(new Set(input.ids));

                        if (ids.length === 0) {
                                return { updatedCount: 0 } as const;
                        }

                        const result = await db
                                .update(event)
                                .set({ status: input.status, updatedAt: sql`now()` })
                                .where(inArray(event.id, ids))
                                .returning({ id: event.id });

                        return { updatedCount: result.length } as const;
                }),
        create: adminProcedure.input(createEventInput).mutation(async ({ input }) => {
                const heroMedia = normalizeHeroMediaInput(input.heroMedia);
                const landingPage = normalizeLandingPageInput(input.landingPage);
                const metadata = input.metadata ?? {};

                try {
                        const [created] = await db
                                .insert(event)
                                .values({
                                        id: randomUUID(),
                                        slug: input.slug,
                                        provider: input.providerId,
                                        flag: input.flagId ?? null,
                                        title: input.title,
                                        description: input.description ?? null,
                                        location: input.location ?? null,
                                        url: input.url ?? null,
                                        heroMedia: heroMedia as Record<string, unknown>,
                                        landingPage: landingPage as Record<string, unknown>,
                                        startAt: input.startAt,
                                        endAt:
                                                input.endAt instanceof Date
                                                        ? input.endAt
                                                        : input.endAt ?? null,
                                        isAllDay: input.isAllDay ?? false,
                                        isPublished: input.isPublished ?? false,
                                        externalId: input.externalId ?? null,
                                        status: "pending",
                                        priority: input.priority,
                                        metadata,
                                })
                                .returning({ id: event.id });

                        if (!created) {
                                throw new TRPCError({
                                        code: "INTERNAL_SERVER_ERROR",
                                        message: "Unable to create event",
                                });
                        }

                        return fetchEventOrThrow(created.id);
                } catch (error) {
                        if (isUniqueViolation(error)) {
                                throw new TRPCError({
                                        code: "CONFLICT",
                                        message: "An event with this slug already exists.",
                                        cause: error,
                                });
                        }
                        throw error;
                }
        }),
        update: adminProcedure.input(updateEventInput).mutation(async ({ input }) => {
                const updates: Record<string, unknown> = { updatedAt: sql`now()` };

                if (input.title !== undefined) updates.title = input.title;
                if (input.slug !== undefined) updates.slug = input.slug;
                if (input.description !== undefined)
                        updates.description = input.description;
                if (input.location !== undefined) updates.location = input.location;
                if (input.url !== undefined) updates.url = input.url;
                if (input.startAt !== undefined) updates.startAt = input.startAt;
		if (input.endAt !== undefined) updates.endAt = input.endAt;
		if (input.isAllDay !== undefined) updates.isAllDay = input.isAllDay;
		if (input.isPublished !== undefined)
			updates.isPublished = input.isPublished;
		if (input.externalId !== undefined) updates.externalId = input.externalId;
		if (input.flagId !== undefined) updates.flag = input.flagId;
                if (input.providerId !== undefined) updates.provider = input.providerId;
                if (input.priority !== undefined) updates.priority = input.priority;
                if (input.metadata !== undefined) updates.metadata = input.metadata;
                if (input.heroMedia !== undefined)
                        updates.heroMedia = normalizeHeroMediaInput(input.heroMedia) as Record<
                                string,
                                unknown
                        >;
                if (input.landingPage !== undefined)
                        updates.landingPage = normalizeLandingPageInput(
                                input.landingPage,
                        ) as Record<string, unknown>;

                if (Object.keys(updates).length === 1) {
                        return fetchEventOrThrow(input.id);
                }

                try {
                        const [updated] = await db
                                .update(event)
                                .set(updates)
                                .where(eq(event.id, input.id))
                                .returning({ id: event.id });

                        if (!updated) {
                                throw new TRPCError({
                                        code: "NOT_FOUND",
                                        message: "Event not found",
                                });
                        }

                        return fetchEventOrThrow(updated.id);
                } catch (error) {
                        if (isUniqueViolation(error)) {
                                throw new TRPCError({
                                        code: "CONFLICT",
                                        message: "An event with this slug already exists.",
                                        cause: error,
                                });
                        }
                        throw error;
                }
        }),
        delete: adminProcedure.input(deleteEventInput).mutation(async ({ input }) => {
                const [deleted] = await db
                        .delete(event)
                        .where(eq(event.id, input.id))
                        .returning({ id: event.id });

                if (!deleted) {
                        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
                }

                return { id: deleted.id } as const;
        }),
        stats: adminProcedure
                .input(statsInputSchema.optional())
                .query(async ({ input }) => {
                        const filters = input ?? {};
			const whereClauses = buildEventFilters(filters);

			const grouped = await db
				.select({
					status: event.status,
					value: count(event.id),
				})
				.from(event)
				.where(whereClauses.length ? and(...whereClauses) : undefined)
				.groupBy(event.status);

			const byStatus = Object.fromEntries(
				event.status.enumValues.map((status) => [
					status,
					grouped.find((row) => row.status === status)?.value ?? 0,
				]),
			) as Record<(typeof event.status.enumValues)[number], number>;

			const total = Object.values(byStatus).reduce(
				(acc, value) => acc + value,
				0,
			);

			return {
				total,
				byStatus,
			} as const;
		}),
});
