import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, isNull, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db } from "@/db";
import { member, organization } from "@/db/schema/auth";
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
	listForUser: protectedProcedure
		.input(listForUserInput)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
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
		const userId = ctx.session.user.id;
		ensureUserCanJoin(ctx.session.user as SessionUser);

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
