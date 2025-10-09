import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { calendarConnection } from "@/db/schema/app";
import {
	clearConnectionCredentials,
	listConnectionsForMember,
	type SanitizedCalendarConnection,
} from "@/lib/calendar-connections";
import { createGoogleOAuthAuthorizationUrl } from "@/lib/calendar-connections/google-oauth";
import { isGoogleOAuthConfigured } from "@/lib/integrations/google-calendar";
import {
	getOrganizationBySlug,
	getOrganizationMembership,
	isUserOrganizationAdmin,
} from "@/lib/org-membership";
import { protectedProcedure, router } from "@/lib/trpc";

const slugInput = z.object({ slug: z.string().min(1) });

const connectionIdInput = slugInput.extend({
	connectionId: z.string().min(1),
});

const updateCalendarInput = connectionIdInput.extend({
	calendarId: z.string().trim().min(1, "Calendar identifier is required"),
});

const startGoogleOAuthInput = slugInput.extend({
	returnTo: z.string().optional(),
});

type SessionUser = {
	id?: string;
};

async function ensureOrgMember(
	slug: string,
	sessionUser: SessionUser | null | undefined,
) {
	if (!sessionUser?.id) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
		});
	}

	const organization = await getOrganizationBySlug(slug);
	if (!organization) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Organization not found",
		});
	}

	const membership = await getOrganizationMembership({
		organizationId: organization.id,
		userId: sessionUser.id,
	});

	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You must belong to this organization",
		});
	}

	return { organization, membership } as const;
}

async function ensureOrgAdmin(
	slug: string,
	sessionUser: SessionUser | null | undefined,
) {
	const { organization, membership } = await ensureOrgMember(slug, sessionUser);

	const isAdmin = await isUserOrganizationAdmin({
		organizationId: organization.id,
		userId: sessionUser!.id!,
	});

	if (!isAdmin) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Administrator permissions are required",
		});
	}

	return { organization, membership } as const;
}

function serializeConnection(connection: SanitizedCalendarConnection) {
	return {
		id: connection.id,
		providerType: connection.providerType,
		status: connection.status,
		calendarId: connection.calendarId,
		externalAccountId: connection.externalAccountId,
		hasCredentials: Boolean(connection.accessToken),
		lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
		failureReason: connection.failureReason,
		metadata: connection.metadata,
		createdAt: connection.createdAt.toISOString(),
		updatedAt: connection.updatedAt.toISOString(),
	};
}

export const calendarConnectionsRouter = router({
	startGoogleOAuth: protectedProcedure
		.input(startGoogleOAuthInput)
		.mutation(async ({ ctx, input }) => {
			if (!isGoogleOAuthConfigured()) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Google OAuth is not configured",
				});
			}

			const sessionUser = ctx.session?.user as SessionUser;
			const { membership } = await ensureOrgAdmin(input.slug, sessionUser);

			const { authorizationUrl } = await createGoogleOAuthAuthorizationUrl({
				memberId: membership.id,
				slug: input.slug,
				userId: sessionUser.id!,
				returnTo: input.returnTo,
			});

			return { authorizationUrl } as const;
		}),
	list: protectedProcedure.input(slugInput).query(async ({ ctx, input }) => {
		const sessionUser = ctx.session?.user as SessionUser;
		const { membership } = await ensureOrgMember(input.slug, sessionUser);
		const connections = await listConnectionsForMember(membership.id);
		return connections.map(serializeConnection);
	}),
	disconnect: protectedProcedure
		.input(connectionIdInput)
		.mutation(async ({ ctx, input }) => {
			const sessionUser = ctx.session?.user as SessionUser;
			const { membership } = await ensureOrgMember(input.slug, sessionUser);
			const existing = await db.query.calendarConnection.findFirst({
				where: eq(calendarConnection.id, input.connectionId),
			});

			if (!existing || existing.memberId !== membership.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Calendar connection not found",
				});
			}

			await clearConnectionCredentials(existing.id);

			await db
				.update(calendarConnection)
				.set({
					status: "revoked",
					failureReason: "Connection was disconnected",
					stateToken: null,
				})
				.where(eq(calendarConnection.id, existing.id));

			return { success: true } as const;
		}),
	updateCalendar: protectedProcedure
		.input(updateCalendarInput)
		.mutation(async ({ ctx, input }) => {
			const sessionUser = ctx.session?.user as SessionUser;
			const { membership } = await ensureOrgMember(input.slug, sessionUser);
			const existing = await db.query.calendarConnection.findFirst({
				where: eq(calendarConnection.id, input.connectionId),
			});

			if (!existing || existing.memberId !== membership.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Calendar connection not found",
				});
			}

			await db
				.update(calendarConnection)
				.set({
					calendarId: input.calendarId,
					status: existing.status === "revoked" ? "pending" : existing.status,
				})
				.where(eq(calendarConnection.id, existing.id));

			return { success: true } as const;
		}),
});
