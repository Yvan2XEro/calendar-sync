import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { calendarConnection } from "@/db/schema/app";
import {
	clearConnectionCredentials,
	listConnectionsForOrganization,
	type SanitizedCalendarConnection,
} from "@/lib/calendar-connections";
import {
	getOrganizationBySlug,
	getOrganizationMembership,
} from "@/lib/org-membership";
import { protectedProcedure, router } from "@/lib/trpc";

const slugInput = z.object({ slug: z.string().min(1) });

const connectionIdInput = slugInput.extend({
	connectionId: z.string().min(1),
});

const updateCalendarInput = connectionIdInput.extend({
	calendarId: z.string().trim().min(1, "Calendar identifier is required"),
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

	return organization;
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
	list: protectedProcedure.input(slugInput).query(async ({ ctx, input }) => {
		const sessionUser = ctx.session?.user as SessionUser;
		const organization = await ensureOrgMember(input.slug, sessionUser);
		const userId = sessionUser?.id;
		if (!userId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Authentication required",
			});
		}
		const connections = await listConnectionsForOrganization(
			organization.id,
			userId,
		);
		return connections.map(serializeConnection);
	}),
	disconnect: protectedProcedure
		.input(connectionIdInput)
		.mutation(async ({ ctx, input }) => {
			const sessionUser = ctx.session?.user as SessionUser;
			const organization = await ensureOrgMember(input.slug, sessionUser);
			const userId = sessionUser?.id;
			if (!userId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Authentication required",
				});
			}
			const existing = await db.query.calendarConnection.findFirst({
				where: eq(calendarConnection.id, input.connectionId),
			});

			if (
				!existing ||
				existing.organizationId !== organization.id ||
				existing.userId !== userId
			) {
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
			const organization = await ensureOrgMember(input.slug, sessionUser);
			const userId = sessionUser?.id;
			if (!userId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Authentication required",
				});
			}
			const existing = await db.query.calendarConnection.findFirst({
				where: eq(calendarConnection.id, input.connectionId),
			});

			if (
				!existing ||
				existing.organizationId !== organization.id ||
				existing.userId !== userId
			) {
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
