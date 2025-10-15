import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	ilike,
	isNull,
	type SQL,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db } from "@/db";
import { event, provider } from "@/db/schema/app";
import { member, organization } from "@/db/schema/auth";
import { parseHeroMedia, parseLandingPage } from "@/lib/event-content";
import { protectedProcedure, router } from "@/lib/trpc";

const DEFAULT_PAGE_SIZE = 6;
const joinedSortValues = ["recent", "name-asc"] as const;
const discoverSortValues = ["name-asc", "members-desc"] as const;

type JoinedSort = (typeof joinedSortValues)[number];
type DiscoverSort = (typeof discoverSortValues)[number];

type SessionUser = {
	id: string;
	banned?: boolean | null;
	role?: string | null;
	roles?: string[] | null;
};

const listForUserInput = z.object({
	segment: z.enum(["joined", "discover"]).default("joined"),
	search: z.string().trim().min(1).max(120).optional(),
	page: z.number().int().min(1).optional(),
	limit: z.number().int().min(1).max(24).optional(),
	sort: z.string().optional(),
});

const joinInput = z.object({
	organizationId: z.string().min(1),
});

const getForUserInput = z.object({
	slug: z.string().trim().min(1),
});

function parseMetadata(value: string | null) {
	if (!value) return null;

	try {
		const parsed = JSON.parse(value) as unknown;
		return typeof parsed === "object" && parsed
			? (parsed as Record<string, unknown>)
			: null;
	} catch (error) {
		console.error("Failed to parse organization metadata", error);
		return null;
	}
}

function resolveUserRoles(user: SessionUser) {
	const roles = new Set<string>();

	if (typeof user.role === "string" && user.role.trim().length > 0) {
		roles.add(user.role.trim());
	}

	if (Array.isArray(user.roles)) {
		for (const role of user.roles) {
			if (typeof role === "string" && role.trim().length > 0) {
				roles.add(role.trim());
			}
		}
	}

	return roles;
}

function ensureUserCanJoin(user: SessionUser | null | undefined) {
	if (!user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
		});
	}

	if (user.banned) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Your account is currently restricted",
		});
	}

	const roles = resolveUserRoles(user);
	const normalizedRoles = roles.size > 0 ? roles : new Set<string>(["user"]);
	const allowed = new Set(["admin", "owner", "member", "user"]);
	const hasPermission = Array.from(normalizedRoles).some((role) =>
		allowed.has(role),
	);

	if (!hasPermission) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You do not have permission to join organizations",
		});
	}
}

function applySearchFilter(filters: SQL[], search?: string) {
	if (!search) {
		return filters;
	}

	const trimmed = search.trim();
	if (trimmed.length === 0) {
		return filters;
	}

	filters.push(ilike(organization.name, `%${trimmed}%`));
	return filters;
}

export const orgsRouter = router({
	getForUser: protectedProcedure
		.input(getForUserInput)
		.query(async ({ ctx, input }) => {
			const sessionUser = ctx.session.user;
			const userId =
				typeof (sessionUser as { id?: unknown })?.id === "string"
					? (sessionUser as { id: string }).id
					: null;
			if (!userId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Session user missing",
				});
			}

			const rows = await db
				.select({
					id: organization.id,
					name: organization.name,
					slug: organization.slug,
					logo: organization.logo,
					metadata: organization.metadata,
					role: member.role,
					joinedAt: member.createdAt,
				})
				.from(organization)
				.innerJoin(
					member,
					and(
						eq(member.organizationId, organization.id),
						eq(member.userId, userId),
					),
				)
				.where(eq(organization.slug, input.slug))
				.limit(1);

			const organizationRow = rows.at(0);

			if (!organizationRow) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

			const now = new Date();

			const eventRows = await db
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
					providerName: provider.name,
				})
				.from(event)
				.innerJoin(provider, eq(provider.id, event.provider))
				.where(
					and(
						eq(event.organizationId, organizationRow.id),
						eq(event.status, "approved"),
						eq(event.isPublished, true),
						gte(event.startAt, now),
					),
				)
				.orderBy(asc(event.startAt), asc(event.id));

			const upcomingEvents = eventRows.map((row) => {
				const metadata = row.metadata ?? null;
				return {
					id: row.id,
					slug: row.slug,
					title: row.title,
					description: row.description,
					location: row.location,
					url: row.url,
					heroMedia: parseHeroMedia(row.heroMedia),
					landingPage: parseLandingPage(row.landingPage),
					startAt:
						row.startAt instanceof Date
							? row.startAt.toISOString()
							: new Date(row.startAt).toISOString(),
					endAt:
						row.endAt instanceof Date
							? row.endAt.toISOString()
							: row.endAt
								? new Date(row.endAt).toISOString()
								: null,
					organization: {
						id: organizationRow.id,
						name: organizationRow.name,
						slug: organizationRow.slug,
					},
					providerName: row.providerName,
					imageUrl:
						typeof metadata?.imageUrl === "string"
							? (metadata.imageUrl as string)
							: null,
					participantCount: null,
					isParticipant: false,
				} as const;
			});

			return {
				organization: {
					id: organizationRow.id,
					name: organizationRow.name,
					slug: organizationRow.slug,
					logo: organizationRow.logo,
					metadata: parseMetadata(organizationRow.metadata),
					role: organizationRow.role,
					joinedAt: organizationRow.joinedAt.toISOString(),
				},
				events: upcomingEvents,
			} as const;
		}),
	listForUser: protectedProcedure
		.input(listForUserInput)
		.query(async ({ ctx, input }) => {
			const sessionUser = ctx.session.user;
			const userId =
				typeof (sessionUser as { id?: unknown })?.id === "string"
					? (sessionUser as { id: string }).id
					: null;
			if (!userId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Session user missing",
				});
			}
			const segment = input.segment;
			const page = input.page ?? 1;
			const limit = input.limit ?? DEFAULT_PAGE_SIZE;
			const offset = (page - 1) * limit;

			if (segment === "joined") {
				const sortValue = joinedSortValues.includes(input.sort as JoinedSort)
					? (input.sort as JoinedSort)
					: ("recent" satisfies JoinedSort);

				const filters: SQL[] = [eq(member.userId, userId)];
				applySearchFilter(filters, input.search);

				const whereCondition =
					filters.length === 1 ? filters[0] : and(...filters);

				const rows = await db
					.select({
						id: organization.id,
						name: organization.name,
						slug: organization.slug,
						logo: organization.logo,
						metadata: organization.metadata,
						joinedAt: member.createdAt,
						role: member.role,
					})
					.from(member)
					.innerJoin(organization, eq(member.organizationId, organization.id))
					.where(whereCondition)
					.orderBy(
						...(sortValue === "recent"
							? [desc(member.createdAt), asc(organization.name)]
							: [asc(organization.name), desc(member.createdAt)]),
					)
					.offset(offset)
					.limit(limit + 1);

				const items = rows.slice(0, limit).map((row) => ({
					id: row.id,
					name: row.name,
					slug: row.slug,
					logo: row.logo,
					metadata: parseMetadata(row.metadata),
					joinedAt: row.joinedAt.toISOString(),
					role: row.role,
				}));

				return {
					segment: "joined" as const,
					page,
					limit,
					sort: sortValue,
					nextPage: rows.length > limit ? page + 1 : null,
					items,
				};
			}

			const sortValue = discoverSortValues.includes(input.sort as DiscoverSort)
				? (input.sort as DiscoverSort)
				: ("name-asc" satisfies DiscoverSort);

			const userMembership = alias(member, "user_membership");
			const membersCountExpr = sql<number>`(
                                SELECT count(*)::int FROM "member" m2 WHERE m2.organization_id = ${organization.id}
                        )`;

			const filters: SQL[] = [isNull(userMembership.id)];
			applySearchFilter(filters, input.search);
			const whereCondition =
				filters.length === 1 ? filters[0] : and(...filters);

			const baseQuery = db
				.select({
					id: organization.id,
					name: organization.name,
					slug: organization.slug,
					logo: organization.logo,
					metadata: organization.metadata,
					membersCount: membersCountExpr,
				})
				.from(organization)
				.leftJoin(
					userMembership,
					and(
						eq(userMembership.organizationId, organization.id),
						eq(userMembership.userId, userId),
					),
				)
				.where(whereCondition)
				.offset(offset)
				.limit(limit + 1);

			const orderedQuery =
				sortValue === "members-desc"
					? baseQuery.orderBy(desc(membersCountExpr), asc(organization.name))
					: baseQuery.orderBy(asc(organization.name));

			const rows = await orderedQuery;

			const items = rows.slice(0, limit).map((row) => ({
				id: row.id,
				name: row.name,
				slug: row.slug,
				logo: row.logo,
				metadata: parseMetadata(row.metadata),
				membersCount: Number(row.membersCount ?? 0),
			}));

			return {
				segment: "discover" as const,
				page,
				limit,
				sort: sortValue,
				nextPage: rows.length > limit ? page + 1 : null,
				items,
			};
		}),
	join: protectedProcedure.input(joinInput).mutation(async ({ ctx, input }) => {
		const sessionUser = ctx.session.user;
		if (!sessionUser || typeof sessionUser !== "object") {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Authentication required",
			});
		}

		const userId = (sessionUser as { id?: unknown }).id;
		if (typeof userId !== "string" || userId.trim().length === 0) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Invalid session user",
			});
		}

		ensureUserCanJoin(sessionUser as SessionUser);

		const existing = await db
			.select({ id: member.id })
			.from(member)
			.where(
				and(
					eq(member.organizationId, input.organizationId),
					eq(member.userId, userId),
				),
			)
			.limit(1);

		if (existing.length > 0) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "You have already joined this organization",
			});
		}

		const org = await db
			.select({
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo,
				metadata: organization.metadata,
			})
			.from(organization)
			.where(eq(organization.id, input.organizationId))
			.limit(1);

		const organizationRow = org.at(0);
		if (!organizationRow) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Organization not found",
			});
		}

		const [inserted] = await db
			.insert(member)
			.values({
				id: randomUUID(),
				userId,
				organizationId: input.organizationId,
				role: "member",
				createdAt: new Date(),
			})
			.returning({
				createdAt: member.createdAt,
				role: member.role,
			});

		return {
			id: organizationRow.id,
			name: organizationRow.name,
			slug: organizationRow.slug,
			logo: organizationRow.logo,
			metadata: parseMetadata(organizationRow.metadata),
			joinedAt: inserted.createdAt.toISOString(),
			role: inserted.role,
		} as const;
	}),
});
