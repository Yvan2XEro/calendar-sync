import { TRPCError } from "@trpc/server";
import {
        SQL,
        alias,
        and,
        asc,
        desc,
        eq,
        ilike,
        isNull,
        sql,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { db } from "@/db";
import { member, organization } from "@/db/schema/auth";
import { protectedProcedure, router } from "@/lib/trpc";

const DEFAULT_PAGE_SIZE = 6;

const searchSchema = z
        .object({
                search: z.string().trim().min(1).max(120).optional(),
                page: z.number().int().min(1).optional(),
                limit: z.number().int().min(1).max(24).optional(),
        })
        .optional();

function parseMetadata(value: string | null) {
        if (!value) return null;
        try {
                const parsed = JSON.parse(value) as unknown;
                return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
        } catch (error) {
                console.error("Failed to parse organization metadata", error);
                return null;
        }
}

export const orgsRouter = router({
        joined: protectedProcedure.input(searchSchema).query(async ({ ctx, input }) => {
                const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
                const page = input?.page ?? 1;
                const offset = (page - 1) * limit;

                const filters: SQL[] = [eq(member.userId, ctx.session.user.id)];
                if (input?.search) {
                        filters.push(ilike(organization.name, `%${input.search}%`));
                }

                const whereCondition = filters.length === 1 ? filters[0] : and(...filters);

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
                        .orderBy(desc(member.createdAt))
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

                const nextPage = rows.length > limit ? page + 1 : null;

                return { items, page, nextPage } as const;
        }),
        discover: protectedProcedure.input(searchSchema).query(async ({ ctx, input }) => {
                const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
                const page = input?.page ?? 1;
                const offset = (page - 1) * limit;

                const userMembership = alias(member, "user_membership");

                const filters: SQL[] = [isNull(userMembership.id)];
                if (input?.search) {
                        filters.push(ilike(organization.name, `%${input.search}%`));
                }

                const whereCondition = filters.length === 1 ? filters[0] : and(...filters);

                const rows = await db
                        .select({
                                id: organization.id,
                                name: organization.name,
                                slug: organization.slug,
                                logo: organization.logo,
                                metadata: organization.metadata,
                                membersCount: sql<number>`(
                                        SELECT count(*)::int FROM "member" m2 WHERE m2.organization_id = ${organization.id}
                                )`,
                        })
                        .from(organization)
                        .leftJoin(
                                userMembership,
                                and(
                                        eq(userMembership.organizationId, organization.id),
                                        eq(userMembership.userId, ctx.session.user.id),
                                ),
                        )
                        .orderBy(asc(organization.name))
                        .where(whereCondition)
                        .offset(offset)
                        .limit(limit + 1);

                const items = rows
                        .slice(0, limit)
                        .map((row) => ({
                                id: row.id,
                                name: row.name,
                                slug: row.slug,
                                logo: row.logo,
                                metadata: parseMetadata(row.metadata),
                                membersCount: Number(row.membersCount ?? 0),
                        }));

                const nextPage = rows.length > limit ? page + 1 : null;

                return { items, page, nextPage } as const;
        }),
        join: protectedProcedure
                .input(
                        z.object({
                                organizationId: z.string().min(1),
                        }),
                )
                .mutation(async ({ ctx, input }) => {
                        const organizationId = input.organizationId;
                        const userId = ctx.session.user.id;

                        const existing = await db
                                .select({ id: member.id })
                                .from(member)
                                .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
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
                                .where(eq(organization.id, organizationId))
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
                                        organizationId,
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
