import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
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

const providerIdInput = z.object({
	providerId: z.string().min(1, "Provider id is required"),
  slug: z.string().min(1, "Organization slug is required"),
});

const slugAndProviderInput = slugInput.extend({
  providerId: z.string().min(1, "Provider id is required"),
});

const PROVIDER_STATUSES = ["draft", "beta", "active", "deprecated"] as const;

const ORGANIZATION_PROVIDER_STATUSES = [
	"pending",
	"configured",
	"ready",
	"error",
] as const;

const DEFAULT_PAGE_SIZE = 20;

const providerConfigSchema = z.object({
	displayName: z.string().min(1, "A display name is required"),
	email: z.string().min(1, "A valid email is required").email(),
	imap: z.object({
		host: z.string().min(1, "IMAP host is required"),
		port: z.number().int().min(1, "IMAP port must be greater than zero"),
		secure: z.boolean(),
		auth: z.object({
			user: z.string().min(1, "IMAP username is required"),
			pass: z.string().min(1, "IMAP password is required"),
		}),
	}),
	smtp: z.object({
		host: z.string().min(1, "SMTP host is required"),
		port: z.number().int().min(1, "SMTP port must be greater than zero"),
		secure: z.boolean(),
		from: z
			.string()
			.email({ message: "A valid From address is required" })
			.optional(),
		auth: z.object({
			user: z.string().min(1, "SMTP username is required"),
			pass: z.string().min(1, "SMTP password is required"),
		}),
	}),
});

type ProviderConfig = z.infer<typeof providerConfigSchema>;
const listInput = slugInput.extend({
  query: z.string().trim().optional(),
  providerStatus: z.enum(PROVIDER_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const orgLinkInput = slugInput.extend({
  providerIds: z
    .array(z.string().min(1, "Provider id is required"))
    .max(100)
    .default([]),
});

const saveInput = slugAndProviderInput.extend({
  draft: providerDraftSchema,
});

type ProviderConfigRedacted = {
	displayName: string;
	email: string;
	imap: {
		host: string;
		port: number;
		secure: boolean;
		auth: { user: string };
	};
	smtp: {
		host: string;
		port: number;
		secure: boolean;
		from?: string | null;
		auth: { user: string };
	};
};

type ProviderCatalogRow = typeof providerCatalog.$inferSelect;

type OrganizationProviderRow = typeof organizationProvider.$inferSelect;

type CatalogProviderStatus = (typeof PROVIDER_STATUSES)[number];
type OrganizationProviderStatus =
	(typeof ORGANIZATION_PROVIDER_STATUSES)[number];

type ProviderCatalogListItem = {
	id: string;
	category: string;
	name: string;
	description: string | null;
	status: CatalogProviderStatus;
	lastTestedAt: Date | null;
	config: ProviderConfigRedacted;
	createdAt: Date;
	updatedAt: Date;
};

type ProviderCatalogDetail = ProviderCatalogListItem;

type OrganizationProviderListItem = {
	id: string;
	providerId: string;
	status: OrganizationProviderStatus;
	imapTestOk: boolean;
	lastTestedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

const catalogListInput = z
	.object({
		query: z.string().trim().optional(),
		status: z.enum(PROVIDER_STATUSES).optional(),
		limit: z.number().int().min(1).max(100).optional(),
		offset: z.number().int().min(0).optional(),
	})
	.optional();

const catalogGetInput = providerIdInput;

const catalogUpsertInput = z.object({
	id: z.string().min(1).optional(),
	category: z.string().min(1, "A category is required"),
	name: z.string().min(1, "A provider name is required"),
	description: z
		.string()
		.trim()
		.transform((value) => (value.length === 0 ? null : value))
		.optional(),
	status: z.enum(PROVIDER_STATUSES).optional(),
	config: providerConfigSchema,
});

const orgLinkInput = slugInput.extend({
	providerId: z.string().min(1, "Provider id is required"),
});

function parseProviderConfig(raw: unknown): ProviderConfig {
	const parsed = providerConfigSchema.safeParse(raw);

	if (!parsed.success) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Stored provider configuration is invalid",
		});
	}

	return parsed.data;
}

function redactProviderConfig(config: ProviderConfig): ProviderConfigRedacted {
	return {
		displayName: config.displayName,
		email: config.email,
		imap: {
			host: config.imap.host,
			port: config.imap.port,
			secure: config.imap.secure,
			auth: { user: config.imap.auth.user },
		},
		smtp: {
			host: config.smtp.host,
			port: config.smtp.port,
			secure: config.smtp.secure,
			from: config.smtp.from ?? null,
			auth: { user: config.smtp.auth.user },
		},
	} satisfies ProviderConfigRedacted;
}

async function ensureProviderCatalogRecord(providerId: string) {
	const catalogProvider = await db.query.provider.findFirst({
		where: eq(providerCatalog.id, providerId),
	});

type CatalogProviderStatus = (typeof PROVIDER_STATUSES)[number];

type ProviderListItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  providerStatus: CatalogProviderStatus;
  isConnected: boolean;
};

type OrgProviderListItem = {
  id: string;
  name: string;
  description: string | null;
  status: CatalogProviderStatus;
  linked: boolean;
};

type OrgProviderListResponse = {
  items: OrgProviderListItem[];
};

type OrgProviderLinkResponse = {
  providerIds: string[];
  added: string[];
  removed: string[];
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
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Provider not found",
		});
	}

	return catalogProvider;
}

function mapCatalogRow(row: ProviderCatalogRow): ProviderCatalogListItem {
	const config = redactProviderConfig(parseProviderConfig(row.config));

	return {
		id: row.id,
		category: row.category,
		name: row.name,
		description: row.description ?? null,
		status: row.status as CatalogProviderStatus,
		lastTestedAt: row.lastTestedAt ?? null,
		config,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	} satisfies ProviderCatalogListItem;
}

function mapOrganizationProviderRow(
	row: OrganizationProviderRow,
): OrganizationProviderListItem {
	return {
		id: row.id,
		providerId: row.providerId,
		status: row.status as OrganizationProviderStatus,
		imapTestOk: row.imapTestOk,
		lastTestedAt: row.lastTestedAt ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	} satisfies OrganizationProviderListItem;

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

const providerTestInput = z.object({
	providerId: z.string().min(1).optional(),
	config: providerConfigSchema,
});

export const providersRouter = router({
	catalog: router({
		list: protectedProcedure
			.input(catalogListInput)
			.query(async ({ ctx, input }) => {
				const session = ctx.session;
				if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

				const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
				const offset = input?.offset ?? 0;
				const query = input?.query?.trim();

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

				if (input?.status) {
					const statusFilter = eq(providerCatalog.status, input.status);
					whereClause = whereClause
						? and(whereClause, statusFilter)
						: statusFilter;
				}

				let listQuery = db
					.select()
					.from(providerCatalog)
					.orderBy(providerCatalog.name)
					.offset(offset)
					.limit(limit);

				if (whereClause) listQuery = listQuery.where(whereClause);

				const rows = await listQuery;

				let totalQuery = db
					.select({ value: sql<number>`count(*)` })
					.from(providerCatalog);

				if (whereClause) totalQuery = totalQuery.where(whereClause);

				const totalResult = await totalQuery;
				const total = totalResult[0]?.value ? Number(totalResult[0].value) : 0;

				const items = rows.map(mapCatalogRow);
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
						status: input?.status ?? null,
					},
				} satisfies {
					items: ProviderCatalogListItem[];
					pagination: {
						total: number;
						limit: number;
						offset: number;
						hasMore: boolean;
						nextOffset: number | null;
					};
					filters: {
						query: string | null;
						status: CatalogProviderStatus | null;
					};
				};
			}),
		get: protectedProcedure
			.input(catalogGetInput)
			.query(async ({ ctx, input }) => {
				const session = ctx.session;
				if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

				const record = await ensureProviderCatalogRecord(input.providerId);
				return mapCatalogRow(record);
			}),
		upsert: protectedProcedure
			.input(catalogUpsertInput)
			.mutation(async ({ ctx, input }) => {
				const session = ctx.session;
				if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

				const providerId = input.id ?? randomUUID();
				const config = providerConfigSchema.parse(input.config);

				const existing = await db.query.provider.findFirst({
					where: eq(providerCatalog.id, providerId),
				});

				const now = new Date();
				const payload = {
					category: input.category,
					name: input.name,
					description: input.description ?? null,
					status: (input.status ??
						existing?.status ??
						"draft") as CatalogProviderStatus,
					config,
					updatedAt: now,
				} satisfies Partial<ProviderCatalogRow>;

				if (existing) {
					await db
						.update(providerCatalog)
						.set(payload)
						.where(eq(providerCatalog.id, providerId));
				} else {
					await db.insert(providerCatalog).values({
						id: providerId,
						category: input.category,
						name: input.name,
						description: input.description ?? null,
						status: (input.status ?? "draft") as CatalogProviderStatus,
						config,
						createdAt: now,
						updatedAt: now,
					});
				}

				const record = await ensureProviderCatalogRecord(providerId);
				return mapCatalogRow(record);
			}),
		testImap: protectedProcedure
			.input(providerTestInput)
			.mutation(async ({ ctx, input }) => {
				const session = ctx.session;
				if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

				const config = providerConfigSchema.parse(input.config);

				const { host, port, secure, auth } = config.imap;
				const client = new ImapFlow({
					host,
					port,
					secure,
					auth,
					logger: false,
				});

				try {
					await client.connect();
					await client.logout();
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "IMAP connection failed",
						cause: error,
					});
				} finally {
					await client.logout().catch(() => undefined);
					await client.close().catch(() => undefined);
				}

				if (input.providerId) {
					await db
						.update(providerCatalog)
						.set({ lastTestedAt: new Date() })
						.where(eq(providerCatalog.id, input.providerId));
				}

				return { ok: true } as const;
			}),
		testSmtp: protectedProcedure
			.input(providerTestInput)
			.mutation(async ({ ctx, input }) => {
				const session = ctx.session;
				if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

				const config = providerConfigSchema.parse(input.config);

				const { host, port, secure, auth } = config.smtp;
				const transporter = nodemailer.createTransport({
					host,
					port,
					secure,
					auth,
				});

				try {
					await transporter.verify();
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "SMTP connection failed",
						cause: error,
					});
				} finally {
					await transporter.close();
				}

				if (input.providerId) {
					await db
						.update(providerCatalog)
						.set({ lastTestedAt: new Date() })
						.where(eq(providerCatalog.id, input.providerId));
				}

				return { ok: true } as const;
			}),
	}),
	org: router({
		list: protectedProcedure.input(slugInput).query(async ({ ctx, input }) => {
			const session = ctx.session;
			if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

			const { organization: org } = await resolveOrganizationMembership({
				slug: input.slug,
				userId: session.user.id,
				requireElevated: true,
			});

			const rows = await db
				.select()
				.from(organizationProvider)
				.where(eq(organizationProvider.organizationId, org.id))
				.orderBy(organizationProvider.createdAt);

			return rows.map(mapOrganizationProviderRow);
		}),
		link: protectedProcedure
			.input(orgLinkInput)
			.mutation(async ({ ctx, input }) => {
				const session = ctx.session;
				if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

				const { organization: org } = await resolveOrganizationMembership({
					slug: input.slug,
					userId: session.user.id,
					requireElevated: true,
				});

				await ensureProviderCatalogRecord(input.providerId);

				const existing = await db.query.organizationProvider.findFirst({
					where: and(
						eq(organizationProvider.organizationId, org.id),
						eq(organizationProvider.providerId, input.providerId),
					),
				});

				if (existing) {
					return mapOrganizationProviderRow(existing);
				}

				const now = new Date();
				const recordId = randomUUID();

				await db.insert(organizationProvider).values({
					id: recordId,
					organizationId: org.id,
					providerId: input.providerId,
					config: {},
					secretsRef: null,
					status: "pending",
					imapTestOk: false,
					lastTestedAt: null,
					createdAt: now,
					updatedAt: now,
				});

				const created = await db.query.organizationProvider.findFirst({
					where: eq(organizationProvider.id, recordId),
				});

				if (!created) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to link provider to organization",
					});
				}

				return mapOrganizationProviderRow(created);
			}),
	}),
  org: router({
    list: protectedProcedure
      .input(slugInput)
      .query(async ({ ctx, input }) => {
        const session = ctx.session;
        if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

        const { organization: org } = await resolveOrganizationMembership({
          slug: input.slug,
          userId: session.user.id,
          requireElevated: true,
        });

        const joinCondition = and(
          eq(organizationProvider.providerId, providerCatalog.id),
          eq(organizationProvider.organizationId, org.id),
        );

        const rows = await db
          .select({
            id: providerCatalog.id,
            name: providerCatalog.name,
            description: providerCatalog.description,
            status: providerCatalog.status,
            organizationProviderId: organizationProvider.id,
          })
          .from(providerCatalog)
          .leftJoin(organizationProvider, joinCondition)
          .orderBy(providerCatalog.name);

        const items: OrgProviderListItem[] = rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description ?? null,
          status: row.status as CatalogProviderStatus,
          linked: Boolean(row.organizationProviderId),
        }));

        return {
          items,
        } satisfies OrgProviderListResponse;
      }),
    link: protectedProcedure
      .input(orgLinkInput)
      .mutation(async ({ ctx, input }) => {
        const session = ctx.session;
        if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

        const { organization: org } = await resolveOrganizationMembership({
          slug: input.slug,
          userId: session.user.id,
          requireElevated: true,
        });

        const requestedIds = Array.from(new Set(input.providerIds));
        const requestedSet = new Set(requestedIds);

        if (requestedIds.length > 0) {
          const catalogRows = await db
            .select({ id: providerCatalog.id })
            .from(providerCatalog)
            .where(inArray(providerCatalog.id, requestedIds));

          if (catalogRows.length !== requestedIds.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One or more providers do not exist",
            });
          }
        }

        const existingLinks = await db.query.organizationProvider.findMany({
          where: eq(organizationProvider.organizationId, org.id),
        });

        const existingByProvider = new Map(
          existingLinks.map((row) => [row.providerId, row]),
        );

        const additions = requestedIds.filter(
          (providerId) => !existingByProvider.has(providerId),
        );
        const removals = existingLinks.filter(
          (row) => !requestedSet.has(row.providerId),
        );

        const now = new Date();

        if (additions.length > 0) {
          await db.insert(organizationProvider).values(
            additions.map((providerId) => ({
              id: randomUUID(),
              organizationId: org.id,
              providerId,
              status: "pending",
              imapTestOk: false,
              lastTestedAt: null,
              config: {} as Record<string, unknown>,
              secretsRef: null,
              createdAt: now,
              updatedAt: now,
            })),
          );
        }

        if (removals.length > 0) {
          await db
            .delete(organizationProvider)
            .where(
              inArray(
                organizationProvider.id,
                removals.map((row) => row.id),
              ),
            );
        }

        return {
          providerIds: requestedIds,
          added: additions,
          removed: removals.map((row) => row.providerId),
        } satisfies OrgProviderLinkResponse;
      }),
  }),
  // Liste admin avec recherche/filtrage/pagination, join sur organizationProvider
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

export type {
	ProviderCatalogDetail,
	ProviderCatalogListItem,
	ProviderConfig,
	ProviderConfigRedacted,
	OrganizationProviderListItem,
  ProviderDetail,
  ProviderDraft,
  ProviderListItem,
  ProviderListResponse,
  OrgProviderLinkResponse,
  OrgProviderListItem,
  OrgProviderListResponse,
  ProviderTestResult,
  ProviderTestTarget,
};
