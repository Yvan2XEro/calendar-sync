import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { z } from "zod";

import { db } from "@/db";
import { member, organization } from "@/db/schema/auth";
import {
  organizationProvider,
  provider as providerCatalog,
} from "@/db/schema/app";
import { readVaultSecret, writeVaultSecret } from "@/lib/vault";
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
    throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
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

type ProviderConfig = z.infer<typeof providerConfigSchema>;

const providerSecretsSchema = z.object({
  imap: z.object({ password: z.string() }).optional(),
  smtp: z.object({ password: z.string() }).optional(),
});

type ProviderSecrets = z.infer<typeof providerSecretsSchema>;

const testImapInput = slugAndProviderInput.extend({
  imap: imapPartialSchema.optional(),
});

const testSmtpInput = slugAndProviderInput.extend({
  smtp: smtpPartialSchema.optional(),
});

const upsertInput = slugAndProviderInput.extend({
  draft: providerDraftSchema,
});

type StoredConfigRow = typeof organizationProvider.$inferSelect;

function toSafeConfig(draft: z.infer<typeof providerDraftSchema>): ProviderConfig {
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

function toSecretsPayload(
  draft: z.infer<typeof providerDraftSchema>,
): ProviderSecrets {
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

export const providers = router({
  list: protectedProcedure.query(async () => {
    const rows = await db
      .select({
        id: providerCatalog.id,
        category: providerCatalog.category,
        name: providerCatalog.name,
        status: providerCatalog.status,
        description: providerCatalog.description,
      })
      .from(providerCatalog)
      .orderBy(providerCatalog.name);

    return rows;
  }),

  get: protectedProcedure
    .input(slugAndProviderInput)
    .query(async ({ ctx, input }) => {
      const session = ctx.session;
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const { organization: org } = await resolveOrganizationMembership({
        slug: input.slug,
        userId: session.user.id,
        requireElevated: true,
      });

      const catalogProvider = await ensureProviderExists(input.providerId);
      const stored = await readStoredConfig(org.id, input.providerId);

      const config = stored?.config
        ? providerConfigSchema.parse(stored.config)
        : null;

      return {
        provider: catalogProvider,
        config,
        status: stored?.status ?? null,
        lastTestedAt: stored?.lastTestedAt ?? null,
        imapTestOk: stored?.imapTestOk ?? false,
        hasSecrets: Boolean(stored?.secretsRef),
      };
    }),

  testImap: protectedProcedure
    .input(testImapInput)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session;
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const { organization: org } = await resolveOrganizationMembership({
        slug: input.slug,
        userId: session.user.id,
        requireElevated: true,
      });

      await ensureProviderExists(input.providerId);

      const stored = await readStoredConfig(org.id, input.providerId);
      const storedConfig = stored?.config
        ? providerConfigSchema.parse(stored.config)
        : null;
      const storedSecrets = stored?.secretsRef
        ? await readVaultSecret<ProviderSecrets>(org.id, stored.secretsRef)
        : null;

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

      const now = new Date();
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

        return { ok: true };
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
    }),

  testSmtp: protectedProcedure
    .input(testSmtpInput)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session;
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const { organization: org } = await resolveOrganizationMembership({
        slug: input.slug,
        userId: session.user.id,
        requireElevated: true,
      });

      await ensureProviderExists(input.providerId);

      const stored = await readStoredConfig(org.id, input.providerId);
      const storedConfig = stored?.config
        ? providerConfigSchema.parse(stored.config)
        : null;
      const storedSecrets = stored?.secretsRef
        ? await readVaultSecret<ProviderSecrets>(org.id, stored.secretsRef)
        : null;

      const smtpSettings = input.smtp ?? null;
      const host = smtpSettings?.host ?? storedConfig?.smtp?.host;
      const port = smtpSettings?.port ?? storedConfig?.smtp?.port;
      const secure =
        smtpSettings?.secure ?? storedConfig?.smtp?.secure ?? false;
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
        return { ok: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SMTP connection failed",
          cause: error,
        });
      } finally {
        await transporter.close();
      }
    }),

  upsert: protectedProcedure
    .input(upsertInput)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session;
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const { organization: org } = await resolveOrganizationMembership({
        slug: input.slug,
        userId: session.user.id,
        requireElevated: true,
      });

      await ensureProviderExists(input.providerId);

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

      const updated = await readStoredConfig(org.id, input.providerId);

      const normalizedConfig = updated?.config
        ? providerConfigSchema.parse(updated.config)
        : safeConfig;

      return {
        providerId: input.providerId,
        config: normalizedConfig,
        status: updated?.status ?? "configured",
        lastTestedAt: updated?.lastTestedAt ?? null,
        imapTestOk: updated?.imapTestOk ?? false,
        hasSecrets: true,
      };
    }),
});
