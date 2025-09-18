import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  organizationProvider,
  provider as providerCatalog,
} from "@/db/schema/app";
import { member, organization } from "@/db/schema/auth";
import { protectedProcedure, router } from "@/lib/trpc";

const elevatedRoles = new Set(["owner", "admin"]);

type MembershipOptions = {
  slug: string;
  userId: string;
  requireElevated?: boolean;
};

async function resolveOrganizationMembership({
  slug,
  userId,
  requireElevated = false,
}: MembershipOptions) {
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
      message: "Administrator permissions are required",
    });
  }

  return { organization: org, membership: membershipRecord };
}

const slugInput = z.object({
  slug: z.string().min(1, "Organization slug is required"),
});

const slugAndProviderInput = slugInput.extend({
  providerId: z.string().min(1, "Provider id is required"),
});

const PROVIDER_STATUSES = ["draft", "beta", "active", "deprecated"] as const;

const listInput = slugInput.extend({
  query: z.string().trim().optional(),
  providerStatus: z.enum(PROVIDER_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

type ProviderCatalogRow = typeof providerCatalog.$inferSelect;

type CatalogProviderStatus = (typeof PROVIDER_STATUSES)[number];

type ProviderListItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  providerStatus: CatalogProviderStatus;
  isConnected: boolean;
};

type ProviderListResponse = {
  items: ProviderListItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  filters: {
    query: string | null;
    providerStatus: CatalogProviderStatus | null;
  };
};

type ProviderDetail = {
  providerId: string;
  provider: {
    id: string;
    category: string;
    name: string;
    description: string | null;
    status: CatalogProviderStatus;
  };
  isConnected: boolean;
  organizationProviderId: string | null;
};

async function ensureProviderExists(providerId: string) {
  const catalogProvider = await db.query.provider.findFirst({
    where: eq(providerCatalog.id, providerId),
  });

  if (!catalogProvider) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found" });
  }

  return catalogProvider;
}

async function findOrganizationProvider(orgId: string, providerId: string) {
  return db.query.organizationProvider.findFirst({
    where: and(
      eq(organizationProvider.organizationId, orgId),
      eq(organizationProvider.providerId, providerId),
    ),
  });
}

async function buildProviderDetail(
  orgId: string,
  providerId: string,
  options?: {
    catalog?: ProviderCatalogRow;
  },
): Promise<ProviderDetail> {
  const catalog = options?.catalog ?? (await ensureProviderExists(providerId));
  const stored = await findOrganizationProvider(orgId, providerId);

  return {
    providerId: catalog.id,
    provider: {
      id: catalog.id,
      category: catalog.category,
      name: catalog.name,
      description: catalog.description ?? null,
      status: catalog.status as CatalogProviderStatus,
    },
    isConnected: Boolean(stored?.id),
    organizationProviderId: stored?.id ?? null,
  } satisfies ProviderDetail;
}

export const providersRouter = router({
  list: protectedProcedure
    .input(listInput)
    .query(async ({ ctx, input }) => {
      const session = ctx.session;
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

      const { organization: org } = await resolveOrganizationMembership({
        slug: input.slug,
        userId: session.user.id,
        requireElevated: true,
      });

      const limit = input.limit ?? 20;
      const offset = input.offset ?? 0;
      const query = input.query?.trim();

      let whereClause: ReturnType<typeof and> | undefined;

      if (query && query.length > 0) {
        const wildcard = `%${query}%`;
        const search = or(
          ilike(providerCatalog.name, wildcard),
          ilike(providerCatalog.description, wildcard),
          ilike(providerCatalog.category, wildcard),
        );
        whereClause = whereClause ? and(whereClause, search) : search;
      }

      if (input.providerStatus) {
        const providerStatusFilter = eq(
          providerCatalog.status,
          input.providerStatus,
        );
        whereClause = whereClause
          ? and(whereClause, providerStatusFilter)
          : providerStatusFilter;
      }

      const joinCondition = and(
        eq(organizationProvider.providerId, providerCatalog.id),
        eq(organizationProvider.organizationId, org.id),
      );

      let listQuery = db
        .select({
          providerId: providerCatalog.id,
          category: providerCatalog.category,
          name: providerCatalog.name,
          description: providerCatalog.description,
          providerStatus: providerCatalog.status,
          organizationProviderId: organizationProvider.id,
        })
        .from(providerCatalog)
        .leftJoin(organizationProvider, joinCondition);

      if (whereClause) listQuery = listQuery.where(whereClause);

      const rows = await listQuery
        .orderBy(providerCatalog.name)
        .offset(offset)
        .limit(limit);

      let totalQuery = db
        .select({ value: sql<number>`count(*)` })
        .from(providerCatalog)
        .leftJoin(organizationProvider, joinCondition);

      if (whereClause) totalQuery = totalQuery.where(whereClause);

      const totalResult = await totalQuery;
      const total = totalResult[0]?.value ? Number(totalResult[0].value) : 0;

      const items: ProviderListItem[] = rows.map((row) => ({
        id: row.providerId,
        name: row.name,
        description: row.description ?? null,
        category: row.category,
        providerStatus: row.providerStatus as CatalogProviderStatus,
        isConnected: Boolean(row.organizationProviderId),
      }));

      const nextOffset = offset + items.length;
      const hasMore = nextOffset < total;

      return {
        items,
        pagination: {
          total,
          limit,
          offset,
          hasMore,
          nextOffset: hasMore ? nextOffset : null,
        },
        filters: {
          query: query ?? null,
          providerStatus: input.providerStatus ?? null,
        },
      } satisfies ProviderListResponse;
    }),

  get: protectedProcedure
    .input(slugAndProviderInput)
    .query(async ({ ctx, input }) => {
      const session = ctx.session;
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

      const { organization: org } = await resolveOrganizationMembership({
        slug: input.slug,
        userId: session.user.id,
        requireElevated: true,
      });

      return buildProviderDetail(org.id, input.providerId);
    }),

  save: protectedProcedure
    .input(
      slugAndProviderInput.extend({
        connect: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session;
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

      const { organization: org } = await resolveOrganizationMembership({
        slug: input.slug,
        userId: session.user.id,
        requireElevated: true,
      });

      const catalogProvider = await ensureProviderExists(input.providerId);
      const connect = input.connect ?? true;
      const existing = await findOrganizationProvider(org.id, input.providerId);

      if (connect) {
        if (!existing) {
          await db.insert(organizationProvider).values({
            id: randomUUID(),
            organizationId: org.id,
            providerId: catalogProvider.id,
          });
        }
      } else if (existing) {
        await db
          .delete(organizationProvider)
          .where(eq(organizationProvider.id, existing.id));
      }

      return buildProviderDetail(org.id, input.providerId, {
        catalog: catalogProvider,
      });
    }),
});

export type { ProviderDetail, ProviderListItem, ProviderListResponse };
