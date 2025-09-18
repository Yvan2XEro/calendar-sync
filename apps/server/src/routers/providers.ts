import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { member, organization } from "@/db/schema/auth";
import { organizationProviderLinks, providers } from "@/db/schema/providers";
import { protectedProcedure, router } from "@/lib/trpc";

const slugInput = z.object({
        slug: z.string().min(1, "Slug is required"),
});

const saveLinksInput = z
        .object({
                slug: z.string().min(1, "Slug is required"),
                providerIds: z.array(z.string().min(1)).max(32),
        })
        .superRefine((value, ctx) => {
                const unique = new Set(value.providerIds);
                if (unique.size !== value.providerIds.length) {
                        ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: "Duplicate provider IDs are not allowed",
                                path: ["providerIds"],
                        });
                }
        });

const elevatedRoles = new Set(["owner", "admin"]);

type MembershipCheckOptions = {
        slug: string;
        userId: string;
        requireElevated?: boolean;
};

async function resolveOrganizationWithMembership({
        slug,
        userId,
        requireElevated = false,
}: MembershipCheckOptions) {
        const org = await db.query.organization.findFirst({
                where: eq(organization.slug, slug),
        });

        if (!org) {
                throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Organization not found",
                });
        }

        const membershipRecord = await db.query.member.findFirst({
                where: and(eq(member.organizationId, org.id), eq(member.userId, userId)),
        });

        if (!membershipRecord) {
                throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "You are not a member of this organization",
                });
        }

        if (requireElevated && !elevatedRoles.has(membershipRecord.role)) {
                throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "You do not have permission to manage providers for this organization",
                });
        }

        return { organization: org, membership: membershipRecord };
}

export const providersRouter = router({
        listAll: protectedProcedure.query(async () => {
                const rows = await db.select().from(providers).orderBy(providers.name);
                return rows;
        }),
        listLinkedBySlug: protectedProcedure
                .input(slugInput)
                .query(async ({ ctx, input }) => {
                        const session = ctx.session;
                        if (!session) {
                                throw new TRPCError({
                                        code: "UNAUTHORIZED",
                                        message: "Authentication required",
                                });
                        }

                        const { organization: org } = await resolveOrganizationWithMembership({
                                slug: input.slug,
                                userId: session.user.id,
                        });

                        const rows = await db
                                .select({
                                        provider: providers,
                                        linkedAt: organizationProviderLinks.createdAt,
                                        updatedAt: organizationProviderLinks.updatedAt,
                                })
                                .from(organizationProviderLinks)
                                .innerJoin(
                                        providers,
                                        eq(organizationProviderLinks.providerId, providers.id),
                                )
                                .where(eq(organizationProviderLinks.organizationId, org.id))
                                .orderBy(providers.name);

                        return rows.map((row) => ({
                                ...row.provider,
                                linkedAt: row.linkedAt,
                                updatedAt: row.updatedAt,
                        }));
                }),
        saveLinks: protectedProcedure
                .input(saveLinksInput)
                .mutation(async ({ ctx, input }) => {
                        const session = ctx.session;
                        if (!session) {
                                throw new TRPCError({
                                        code: "UNAUTHORIZED",
                                        message: "Authentication required",
                                });
                        }

                        const { organization: org } =
                                await resolveOrganizationWithMembership({
                                        slug: input.slug,
                                        userId: session.user.id,
                                        requireElevated: true,
                                });

                        const desiredIds = [...input.providerIds];
                        const uniqueIds = Array.from(new Set(desiredIds));

                        if (uniqueIds.length > 0) {
                                const existingProviders = await db
                                        .select({ id: providers.id })
                                        .from(providers)
                                        .where(inArray(providers.id, uniqueIds));

                                if (existingProviders.length !== uniqueIds.length) {
                                        throw new TRPCError({
                                                code: "BAD_REQUEST",
                                                message: "One or more provider IDs are invalid",
                                        });
                                }
                        }

                        const updatedProviders = await db.transaction(async (tx) => {
                                const existingLinks = await tx
                                        .select({ providerId: organizationProviderLinks.providerId })
                                        .from(organizationProviderLinks)
                                        .where(eq(organizationProviderLinks.organizationId, org.id));

                                const existingSet = new Set(
                                        existingLinks.map((link) => link.providerId),
                                );
                                const desiredSet = new Set(uniqueIds);

                                const toInsert = uniqueIds.filter(
                                        (providerId) => !existingSet.has(providerId),
                                );
                                const toDelete = existingLinks
                                        .map((link) => link.providerId)
                                        .filter((providerId) => !desiredSet.has(providerId));

                                const now = new Date();

                                if (toInsert.length > 0) {
                                        await tx
                                                .insert(organizationProviderLinks)
                                                .values(
                                                        toInsert.map((providerId) => ({
                                                                organizationId: org.id,
                                                                providerId,
                                                                linkedById: session.user.id,
                                                                createdAt: now,
                                                                updatedAt: now,
                                                        })),
                                                )
                                                .onConflictDoUpdate({
                                                        target: [
                                                                organizationProviderLinks.organizationId,
                                                                organizationProviderLinks.providerId,
                                                        ],
                                                        set: {
                                                                linkedById: session.user.id,
                                                                updatedAt: now,
                                                        },
                                                });
                                }

                                if (toDelete.length > 0) {
                                        await tx
                                                .delete(organizationProviderLinks)
                                                .where(
                                                        and(
                                                                eq(
                                                                        organizationProviderLinks.organizationId,
                                                                        org.id,
                                                                ),
                                                                inArray(
                                                                        organizationProviderLinks.providerId,
                                                                        toDelete,
                                                                ),
                                                        ),
                                                );
                                }

                                const rows = await tx
                                        .select({
                                                provider: providers,
                                                linkedAt: organizationProviderLinks.createdAt,
                                                updatedAt: organizationProviderLinks.updatedAt,
                                        })
                                        .from(organizationProviderLinks)
                                        .innerJoin(
                                                providers,
                                                eq(
                                                        organizationProviderLinks.providerId,
                                                        providers.id,
                                                ),
                                        )
                                        .where(eq(organizationProviderLinks.organizationId, org.id))
                                        .orderBy(providers.name);

                                return rows.map((row) => ({
                                        ...row.provider,
                                        linkedAt: row.linkedAt,
                                        updatedAt: row.updatedAt,
                                }));
                        });

                        return updatedProviders;
                }),
});
