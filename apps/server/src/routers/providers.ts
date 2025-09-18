import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, ilike, or, sql } from "drizzle-orm";
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
import { readVaultSecret, writeVaultSecret } from "@/lib/vault";

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

const imapDraftSchema = z.object({
  host: z.string().min(1, "IMAP host is required"),
  port: z.number().int().min(1),
  secure: z.boolean(),
  auth: z.object({
    user: z.string().min(1, "IMAP username is required"),
    pass: z.string().min(1, "IMAP password is required"),
  }),
});

const imapPartialSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).optional(),
  secure: z.boolean().optional(),
  auth: z
    .object({
      user: z.string().min(1).optional(),
      pass: z.string().min(1).optional(),
    })
    .optional(),
});

const smtpDraftSchema = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.number().int().min(1),
  secure: z.boolean(),
  from: z
    .string()
    .email({ message: "A valid From address is required" })
    .optional(),
  auth: z.object({
    user: z.string().min(1, "SMTP username is required"),
    pass: z.string().min(1, "SMTP password is required"),
  }),
});

const smtpPartialSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).optional(),
  secure: z.boolean().optional(),
  from: z.string().email().optional(),
  auth: z
    .object({
      user: z.string().min(1).optional(),
      pass: z.string().min(1).optional(),
    })
    .optional(),
});

const providerDraftSchema = z.object({
  displayName: z.string().min(1, "A display name is required"),
  email: z.string().email({ message: "A valid email is required" }),
  imap: imapDraftSchema,
  smtp: smtpDraftSchema,
});

const providerConfigSchema = z.object({
  displayName: z.string(),
  email: z.string(),
  imap: z.object({
    host: z.string(),
    port: z.number().int(),
    secure: z.boolean(),
    authUser: z.string(),
  }),
  smtp: z.object({
    host: z.string(),
    port: z.number().int(),
    secure: z.boolean(),
    authUser: z.string(),
    from: z.string().email().optional(),
  }),
});

type ProviderDraft = z.infer<typeof providerDraftSchema>;
type ProviderConfig = z.infer<typeof providerConfigSchema>;

const providerSecretsSchema = z.object({
  imap: z.object({ password: z.string() }).optional(),
  smtp: z.object({ password: z.string() }).optional(),
});

type ProviderSecrets = z.infer<typeof providerSecretsSchema>;

const PROVIDER_STATUSES = ["draft", "beta", "active", "deprecated"] as const;

const ORGANIZATION_PROVIDER_STATUSES = [
  "pending",
  "configured",
  "ready",
  "error",
] as const;

const TEST_TARGETS = ["imap", "smtp"] as const;

const adminListInput = slugInput.extend({
  query: z.string().trim().optional(),
  status: z.enum(ORGANIZATION_PROVIDER_STATUSES).optional(),
  providerStatus: z.enum(PROVIDER_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const saveInput = slugAndProviderInput.extend({
  draft: providerDraftSchema,
});

const testInput = slugAndProviderInput.extend({
  target: z.enum(TEST_TARGETS),
  imap: imapPartialSchema.optional(),
  smtp: smtpPartialSchema.optional(),
});

type StoredConfigRow = typeof organizationProvider.$inferSelect;
type ProviderCatalogRow = typeof providerCatalog.$inferSelect;

type OrganizationProviderStatus =
  (typeof ORGANIZATION_PROVIDER_STATUSES)[number];
type CatalogProviderStatus = (typeof PROVIDER_STATUSES)[number];
type ProviderTestTarget = (typeof TEST_TARGETS)[number];

type ProviderListItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  providerStatus: CatalogProviderStatus;
  status: OrganizationProviderStatus;
  lastTestedAt: Date | null;
  imapTestOk: boolean;
  hasConfig: boolean;
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
    status: OrganizationProviderStatus | null;
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
  config: ProviderConfig | null;
  status: OrganizationProviderStatus;
  lastTestedAt: Date | null;
  imapTestOk: boolean;
  hasSecrets: boolean;
};

type ProviderTestResult = ProviderDetail & {
  target: ProviderTestTarget;
  ok: true;
};

const DEFAULT_PAGE_SIZE = 20;

function toSafeConfig(draft: ProviderDraft): ProviderConfig {
  return {
    displayName: draft.displayName,
    email: draft.email,
    imap: {
      host: draft.imap.host,
      port: draft.imap.port,
      secure: draft.imap.secure,
      authUser: draft.imap.auth.user,
    },
    smtp: {
      host: draft.smtp.host,
      port: draft.smtp.port,
      secure: draft.smtp.secure,
      authUser: draft.smtp.auth.user,
      from: draft.smtp.from,
    },
  } satisfies ProviderConfig;
}

function toSecretsPayload(draft: ProviderDraft): ProviderSecrets {
  return providerSecretsSchema.parse({
    imap: { password: draft.imap.auth.pass },
    smtp: { password: draft.smtp.auth.pass },
  });
}

async function ensureProviderExists(providerId: string) {
  const catalogProvider = await db.query.provider.findFirst({
    where: eq(providerCatalog.id, providerId),
  });

  if (!catalogProvider) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found" });
  }

  return catalogProvider;
}

async function readStoredConfig(
  orgId: string,
  providerId: string,
): Promise<StoredConfigRow | null> {
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
    stored?: StoredConfigRow | null;
  },
): Promise<ProviderDetail> {
  const catalog = options?.catalog ?? (await ensureProviderExists(providerId));
  const stored = options?.stored ?? (await readStoredConfig(orgId, providerId));

  const config = stored?.config
    ? providerConfigSchema.parse(stored.config)
    : null;

  return {
    providerId: catalog.id,
    provider: {
      id: catalog.id,
      category: catalog.category,
      name: catalog.name,
      description: catalog.description ?? null,
      status: catalog.status as CatalogProviderStatus,
    },
    config,
    status: (stored?.status as OrganizationProviderStatus) ?? "pending",
    lastTestedAt: stored?.lastTestedAt ?? null,
    imapTestOk: stored?.imapTestOk ?? false,
    hasSecrets: Boolean(stored?.secretsRef),
  } satisfies ProviderDetail;
}

export const providersRouter = router({
  // Liste admin avec recherche/filtrage/pagination, join sur organizationProvider
  list: protectedProcedure
    .input(adminListInput)
    .query(async ({ ctx, input }) => {
      const session = ctx.session;
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

      const { organization: org } = await resolveOrganizationMembership({
        slug: input.slug,
        userId: session.user.id,
        requireElevated: true,
      });

      const limit = input.limit ?? DEFAULT_PAGE_SIZE;
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

      if (input.status) {
        const organizationStatusFilter = eq(
          organizationProvider.status,
          input.status,
        );
        whereClause = whereClause
          ? and(whereClause, organizationStatusFilter)
          : organizationStatusFilter;
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
          organizationStatus: organizationProvider.status,
          imapTestOk: organizationProvider.imapTestOk,
          lastTestedAt: organizationProvider.lastTestedAt,
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
        status:
          (row.organizationStatus as OrganizationProviderStatus) ?? "pending",
        lastTestedAt: row.lastTestedAt ?? null,
        imapTestOk: row.imapTestOk ?? false,
        hasConfig: Boolean(row.organizationProviderId),
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
          status: input.status ?? null,
          providerStatus: input.providerStatus ?? null,
        },
      } satisfies ProviderListResponse;
    }),

  // Détail combinant catalogue + config org
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

  // Sauvegarde/upsert des settings + secrets
  save: protectedProcedure.input(saveInput).mutation(async ({ ctx, input }) => {
    const session = ctx.session;
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

    const { organization: org } = await resolveOrganizationMembership({
      slug: input.slug,
      userId: session.user.id,
      requireElevated: true,
    });

    const catalogProvider = await ensureProviderExists(input.providerId);

    const draft = providerDraftSchema.parse(input.draft);
    const safeConfig = toSafeConfig(draft);
    const secrets = toSecretsPayload(draft);

    const now = new Date();

    const existing = await readStoredConfig(org.id, input.providerId);
    const secretsRef = await writeVaultSecret(
      org.id,
      secrets,
      existing?.secretsRef,
    );

    if (existing) {
      await db
        .update(organizationProvider)
        .set({
          config: safeConfig,
          secretsRef,
          status: "configured",
          imapTestOk: false,
          lastTestedAt: null,
          updatedAt: now,
        })
        .where(eq(organizationProvider.id, existing.id));
    } else {
      await db.insert(organizationProvider).values({
        id: randomUUID(),
        organizationId: org.id,
        providerId: input.providerId,
        config: safeConfig,
        secretsRef,
        status: "configured",
        imapTestOk: false,
        lastTestedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return buildProviderDetail(org.id, input.providerId, {
      catalog: catalogProvider,
    });
  }),

  // Test IMAP/SMTP via `target`
  test: protectedProcedure.input(testInput).mutation(async ({ ctx, input }) => {
    const session = ctx.session;
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

    const { organization: org } = await resolveOrganizationMembership({
      slug: input.slug,
      userId: session.user.id,
      requireElevated: true,
    });

    const catalogProvider = await ensureProviderExists(input.providerId);
    const stored = await readStoredConfig(org.id, input.providerId);
    const storedConfig = stored?.config
      ? providerConfigSchema.parse(stored.config)
      : null;
    const storedSecrets = stored?.secretsRef
      ? await readVaultSecret<ProviderSecrets>(org.id, stored.secretsRef)
      : null;

    const now = new Date();

    if (input.target === "imap") {
      const imapSettings = input.imap ?? null;
      const host = imapSettings?.host ?? storedConfig?.imap?.host;
      const port = imapSettings?.port ?? storedConfig?.imap?.port;
      const secure =
        imapSettings?.secure ?? storedConfig?.imap?.secure ?? false;
      const user = imapSettings?.auth?.user ?? storedConfig?.imap?.authUser;
      const pass =
        imapSettings?.auth?.pass ?? storedSecrets?.imap?.password ?? null;

      if (!host || !port || !user || !pass) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Incomplete IMAP settings provided",
        });
      }

      const client = new ImapFlow({
        host,
        port,
        secure,
        auth: { user, pass },
        logger: false,
      });

      try {
        await client.connect();
        await client.logout();

        if (stored) {
          await db
            .update(organizationProvider)
            .set({
              imapTestOk: true,
              status: "ready",
              lastTestedAt: now,
              updatedAt: now,
            })
            .where(eq(organizationProvider.id, stored.id));
        }
      } catch (error) {
        if (stored) {
          await db
            .update(organizationProvider)
            .set({
              imapTestOk: false,
              status: "error",
              lastTestedAt: now,
              updatedAt: now,
            })
            .where(eq(organizationProvider.id, stored.id));
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "IMAP connection failed",
          cause: error,
        });
      } finally {
        await client.logout().catch(() => undefined);
        await client.close().catch(() => undefined);
      }

      const detail = await buildProviderDetail(org.id, input.providerId, {
        catalog: catalogProvider,
      });

      return {
        ...detail,
        target: input.target,
        ok: true,
      } satisfies ProviderTestResult;
    }

    // SMTP
    const smtpSettings = input.smtp ?? null;
    const host = smtpSettings?.host ?? storedConfig?.smtp?.host;
    const port = smtpSettings?.port ?? storedConfig?.smtp?.port;
    const secure = smtpSettings?.secure ?? storedConfig?.smtp?.secure ?? false;
    const user = smtpSettings?.auth?.user ?? storedConfig?.smtp?.authUser;
    const pass =
      smtpSettings?.auth?.pass ?? storedSecrets?.smtp?.password ?? null;

    if (!host || !port || !user || !pass) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Incomplete SMTP settings provided",
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
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

    const detail = await buildProviderDetail(org.id, input.providerId, {
      catalog: catalogProvider,
      stored,
    });

    return {
      ...detail,
      target: input.target,
      ok: true,
    } satisfies ProviderTestResult;
  }),
});

export type {
  ProviderDetail,
  ProviderDraft,
  ProviderListItem,
  ProviderListResponse,
  ProviderTestResult,
  ProviderTestTarget,
};
