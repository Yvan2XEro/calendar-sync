import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { z } from "zod";

import { db } from "@/db";
import { organizationProvider, provider } from "@/db/schema/app";
import { member, organization } from "@/db/schema/auth";
import { adminProcedure, router } from "@/lib/trpc";

const providerStatuses = ["draft", "beta", "active", "deprecated"] as const;

const providerConfigSchema = z
	.object({
		displayName: z.string().min(1, "Display name is required"),
		email: z.string().min(1, "Email is required").email("Enter a valid email"),
		imap: z.object({
			host: z.string().min(1, "IMAP host is required"),
			port: z.number().int().min(1, "IMAP port must be positive"),
			secure: z.boolean(),
			auth: z.object({
				user: z.string().min(1, "IMAP username is required"),
				pass: z.string().min(1, "IMAP password is required"),
			}),
		}),
		smtp: z.object({
			host: z.string().min(1, "SMTP host is required"),
			port: z.number().int().min(1, "SMTP port must be positive"),
			secure: z.boolean(),
			from: z.string().email("Enter a valid From address").optional(),
			auth: z.object({
				user: z.string().min(1, "SMTP username is required"),
				pass: z.string().min(1, "SMTP password is required"),
			}),
		}),
	})
	.passthrough();

type ProviderConfig = z.infer<typeof providerConfigSchema>;

type ProviderRow = typeof provider.$inferSelect;

const elevatedRoles = new Set(["owner", "admin"]);

const catalogSummarySelection = {
	id: provider.id,
	name: provider.name,
	category: provider.category,
	status: provider.status,
	trusted: provider.trusted,
	lastTestedAt: provider.lastTestedAt,
};

function redactConfig(config: ProviderRow["config"]) {
	if (!config) return {} as Record<string, unknown>;

	const secretKeys = new Set(["pass", "password", "secret", "token"]);

	const clone = structuredClone(config) as Record<string, unknown>;

	const redact = (value: unknown): unknown => {
		if (Array.isArray(value)) {
			return value.map((item) => redact(item));
		}

		if (value && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value as Record<string, unknown>).map(([key, val]) => {
					if (secretKeys.has(key)) {
						return [
							key,
							typeof val === "string" && val.length > 0 ? "••••••" : val,
						];
					}

					return [key, redact(val)];
				}),
			);
		}

		return value;
	};

	return redact(clone) as Record<string, unknown>;
}

async function resolveOrganizationBySlug(slug: string) {
	const org = await db.query.organization.findFirst({
		where: eq(organization.slug, slug),
	});

	if (!org) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Organization not found",
		});
	}

	return org;
}

async function ensureOrganizationAdmin(slug: string, userId: string) {
	const org = await resolveOrganizationBySlug(slug);

	const membership = await db.query.member.findFirst({
		where: and(eq(member.organizationId, org.id), eq(member.userId, userId)),
	});

	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not a member of this organization",
		});
	}

	if (!elevatedRoles.has(membership.role)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Administrator permissions are required",
		});
	}

	return org;
}

async function fetchProviderOrThrow(providerId: string) {
	const record = await db.query.provider.findFirst({
		where: eq(provider.id, providerId),
	});

	if (!record) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Provider not found",
		});
	}

	return record;
}

async function resolveTestConfig(input: {
	providerId?: string | null;
	config?: ProviderConfig | Record<string, unknown> | null;
}) {
	if (input.config) {
		return providerConfigSchema.parse(input.config);
	}

	if (!input.providerId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Provide either a provider id or configuration to test",
		});
	}

	const record = await fetchProviderOrThrow(input.providerId);

	try {
		return providerConfigSchema.parse(record.config);
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Stored provider configuration is invalid",
			cause: error,
		});
	}
}

async function testImapConnection(config: ProviderConfig) {
	const client = new ImapFlow({
		host: config.imap.host,
		port: config.imap.port,
		secure: config.imap.secure,
		auth: {
			user: config.imap.auth.user,
			pass: config.imap.auth.pass,
		},
		logger: false,
	});

	try {
		await client.connect();
		await client.logout();
	} catch (error) {
		console.error(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "IMAP connection failed",
			cause: error,
		});
	} finally {
		await client.logout().catch(() => undefined);
		await client.close();
	}
}

async function testSmtpConnection(config: ProviderConfig) {
	const transporter = nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port,
		secure: config.smtp.secure,
		auth: {
			user: config.smtp.auth.user,
			pass: config.smtp.auth.pass,
		},
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
		transporter.close();
	}
}

const providerIdInput = z.object({
	providerId: z.string().min(1, "Provider id is required"),
});

export const providersRouter = router({
	catalog: router({
		list: adminProcedure.query(async ({ ctx }) => {
			if (!ctx.session) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}

			const rows = await db
				.select(catalogSummarySelection)
				.from(provider)
				.orderBy(provider.name);

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				category: row.category,
				status: row.status,
				trusted: row.trusted,
				lastTestedAt: row.lastTestedAt ?? null,
			}));
		}),
		get: adminProcedure.input(providerIdInput).query(async ({ ctx, input }) => {
			if (!ctx.session) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}

			const record = await fetchProviderOrThrow(input.providerId);

			return {
				id: record.id,
				category: record.category,
				name: record.name,
				description: record.description ?? null,
				status: record.status,
				trusted: record.trusted,
				lastTestedAt: record.lastTestedAt ?? null,
				createdAt: record.createdAt,
				updatedAt: record.updatedAt,
				config: redactConfig(record.config),
			};
		}),
		upsert: adminProcedure
			.input(
				z.object({
					id: z.string().min(1).optional(),
					category: z.string().min(1, "Category is required"),
					name: z.string().min(1, "Name is required"),
					description: z
						.string()
						.trim()
						.transform((value) => (value.length === 0 ? null : value))
						.nullable()
						.optional(),
					status: z.enum(providerStatuses).optional(),
					trusted: z.boolean().optional(),
					config: providerConfigSchema,
				}),
			)
			.mutation(async ({ ctx, input }) => {
				if (!ctx.session) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}

				const providerId = input.id ?? randomUUID();
				const config = providerConfigSchema.parse(input.config);
				const now = new Date();

				const existing = await db.query.provider.findFirst({
					where: eq(provider.id, providerId),
				});

				if (existing) {
					await db
						.update(provider)
						.set({
							category: input.category,
							name: input.name,
							description: input.description ?? null,
							status: input.status ?? existing.status,
							trusted: input.trusted ?? existing.trusted ?? false,
							config,
							updatedAt: now,
						})
						.where(eq(provider.id, providerId));
				} else {
					await db.insert(provider).values({
						id: providerId,
						category: input.category,
						name: input.name,
						description: input.description ?? null,
						status: input.status ?? "draft",
						trusted: input.trusted ?? false,
						config,
						lastTestedAt: null,
						createdAt: now,
						updatedAt: now,
					});
				}

				return { id: providerId };
			}),
		delete: adminProcedure
			.input(providerIdInput)
			.mutation(async ({ ctx, input }) => {
				if (!ctx.session) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}

				await fetchProviderOrThrow(input.providerId);

				await db.delete(provider).where(eq(provider.id, input.providerId));

				return { ok: true } as const;
			}),
		testImap: adminProcedure
			.input(
				z.object({
					providerId: z.string().min(1).optional(),
					config: providerConfigSchema.optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				if (!ctx.session) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}

				const config = await resolveTestConfig({
					providerId: input.providerId,
					config: input.config,
				});

				await testImapConnection(config);

				if (input.providerId) {
					await db
						.update(provider)
						.set({ lastTestedAt: new Date() })
						.where(eq(provider.id, input.providerId));
				}

				return { ok: true } as const;
			}),
		testSmtp: adminProcedure
			.input(
				z.object({
					providerId: z.string().min(1).optional(),
					config: providerConfigSchema.optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				if (!ctx.session) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}

				const config = await resolveTestConfig({
					providerId: input.providerId,
					config: input.config,
				});

				await testSmtpConnection(config);

				if (input.providerId) {
					await db
						.update(provider)
						.set({ lastTestedAt: new Date() })
						.where(eq(provider.id, input.providerId));
				}

				return { ok: true } as const;
			}),
	}),
	org: router({
		list: adminProcedure
			.input(
				z.object({ slug: z.string().min(1, "Organization slug is required") }),
			)
			.query(async ({ ctx, input }) => {
				if (!ctx.session) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}

				const org = await ensureOrganizationAdmin(
					input.slug,
					ctx.session.user.id,
				);

				const [linkedRows, catalogRows] = await Promise.all([
					db
						.select({ providerId: organizationProvider.providerId })
						.from(organizationProvider)
						.where(eq(organizationProvider.organizationId, org.id)),
					db
						.select(catalogSummarySelection)
						.from(provider)
						.orderBy(provider.name),
				]);

				return {
					linkedProviderIds: linkedRows.map((row) => row.providerId),
					catalogSummary: catalogRows.map((row) => ({
						id: row.id,
						name: row.name,
						category: row.category,
						status: row.status,
						lastTestedAt: row.lastTestedAt ?? null,
					})),
				};
			}),
		link: adminProcedure
			.input(
				z.object({
					slug: z.string().min(1, "Organization slug is required"),
					providerIds: z.array(z.string().min(1)).max(100).default([]),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				if (!ctx.session) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}

				const org = await ensureOrganizationAdmin(
					input.slug,
					ctx.session.user.id,
				);

				const uniqueIds = Array.from(new Set(input.providerIds));
				const requestedSet = new Set(uniqueIds);

				if (uniqueIds.length > 0) {
					const catalogMatches = await db
						.select({ id: provider.id })
						.from(provider)
						.where(inArray(provider.id, uniqueIds));

					if (catalogMatches.length !== uniqueIds.length) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "One or more providers do not exist",
						});
					}
				}

				const existingLinks = await db
					.select({
						id: organizationProvider.id,
						providerId: organizationProvider.providerId,
					})
					.from(organizationProvider)
					.where(eq(organizationProvider.organizationId, org.id));

				const toRemove = existingLinks
					.filter((row) => !requestedSet.has(row.providerId))
					.map((row) => row.id);

				const existingIds = new Set(existingLinks.map((row) => row.providerId));
				const toAdd = uniqueIds.filter((id) => !existingIds.has(id));

				if (toRemove.length > 0) {
					await db
						.delete(organizationProvider)
						.where(inArray(organizationProvider.id, toRemove));
				}

				if (toAdd.length > 0) {
					await db
						.insert(organizationProvider)
						.values(
							toAdd.map((providerId) => ({
								id: randomUUID(),
								organizationId: org.id,
								providerId,
							})),
						)
						.onConflictDoNothing({
							target: [
								organizationProvider.organizationId,
								organizationProvider.providerId,
							],
						});
				}

				return { linkedProviderIds: uniqueIds };
			}),
	}),
});
