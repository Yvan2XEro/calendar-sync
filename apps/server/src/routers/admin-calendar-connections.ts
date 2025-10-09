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
import {
	getOrganizationBySlug,
	getOrganizationMembership,
} from "@/lib/org-membership";
import { adminProcedure, router } from "@/lib/trpc";

const slugInput = z.object({ slug: z.string().min(1) });

const connectionIdInput = slugInput.extend({
	connectionId: z.string().min(1),
});

const updateCalendarInput = connectionIdInput.extend({
	calendarId: z.string().trim().min(1, "Calendar identifier is required"),
});

type SessionUser = {
	id?: string;
	roles?: string[] | null;
};

async function ensureOrgAdmin(
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
			message: "You must be an administrator of this organization",
		});
	}

	if (membership.role !== "owner" && membership.role !== "admin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You must be an administrator of this organization",
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

export const adminCalendarConnectionsRouter = router({
	list: adminProcedure.input(slugInput).query(async ({ ctx, input }) => {
		const sessionUser = ctx.session?.user as SessionUser;
		if (!sessionUser?.id) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Authentication required",
			});
		}

		const { membership } = await ensureOrgAdmin(input.slug, sessionUser);
		const connections = await listConnectionsForMember(membership.id);
		return connections.map(serializeConnection);
	}),
	disconnect: adminProcedure
		.input(connectionIdInput)
		.mutation(async ({ ctx, input }) => {
			const { membership } = await ensureOrgAdmin(
				input.slug,
				ctx.session?.user as SessionUser,
			);
			const sessionUser = ctx.session?.user as SessionUser;
			if (!sessionUser?.id) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Authentication required",
				});
			}
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
					failureReason: "Connection was disconnected by an administrator",
					stateToken: null,
				})
				.where(eq(calendarConnection.id, existing.id));

			return { success: true } as const;
		}),
	updateCalendar: adminProcedure
		.input(updateCalendarInput)
		.mutation(async ({ ctx, input }) => {
			const { membership } = await ensureOrgAdmin(
				input.slug,
				ctx.session?.user as SessionUser,
			);
			const sessionUser = ctx.session?.user as SessionUser;
			if (!sessionUser?.id) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Authentication required",
				});
			}
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
