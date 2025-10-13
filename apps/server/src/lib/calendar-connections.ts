import { and, desc, eq } from "drizzle-orm";
import type { Credentials } from "google-auth-library";
import { db } from "@/db";
import {
	calendarConnection,
	type calendarConnectionStatus,
} from "@/db/schema/app";
import { member } from "@/db/schema/auth";

export type CalendarConnectionRow = typeof calendarConnection.$inferSelect;

export type SanitizedCalendarConnection = ReturnType<typeof sanitizeConnection>;

const CONNECTED_STATUS =
	"connected" as (typeof calendarConnectionStatus.enumValues)[number];

type CalendarMetadata = Record<string, unknown>;

function toMetadata(
	value: CalendarConnectionRow["metadata"],
): CalendarMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as CalendarMetadata;
}

export function sanitizeConnection(
	row: CalendarConnectionRow,
): CalendarConnectionRow & { metadata: CalendarMetadata } {
	return {
		...row,
		metadata: toMetadata(row.metadata),
	};
}

export async function listConnectionsForMember(memberId: string) {
	const rows = await db.query.calendarConnection.findMany({
		where: eq(calendarConnection.memberId, memberId),
		orderBy: (table) => [desc(table.updatedAt)],
	});
	return rows.map(sanitizeConnection);
}

export async function resolveGoogleCalendarConnection(
	organizationId: string,
	memberId?: string,
) {
	const conditions = [
		eq(member.organizationId, organizationId),
		eq(calendarConnection.providerType, "google"),
		eq(calendarConnection.status, CONNECTED_STATUS),
	];

	if (memberId) {
		conditions.push(eq(calendarConnection.memberId, memberId));
	}

	const rows = await db
		.select({ connection: calendarConnection })
		.from(calendarConnection)
		.innerJoin(member, eq(member.id, calendarConnection.memberId))
		.where(and(...conditions))
		.orderBy(desc(calendarConnection.updatedAt))
		.limit(1);

	const row = rows.at(0);
	return row ? sanitizeConnection(row.connection) : null;
}

export async function updateConnectionCredentials(
	connection: CalendarConnectionRow,
	credentials: Credentials,
) {
	const metadata = {
		...toMetadata(connection.metadata),
		lastTokenRefreshedAt: new Date().toISOString(),
	} satisfies CalendarMetadata;

	await db
		.update(calendarConnection)
		.set({
			accessToken: credentials.access_token ?? connection.accessToken ?? null,
			refreshToken:
				credentials.refresh_token ?? connection.refreshToken ?? null,
			tokenExpiresAt: credentials.expiry_date
				? new Date(credentials.expiry_date)
				: (connection.tokenExpiresAt ?? null),
			scope: credentials.scope ?? connection.scope ?? null,
			metadata,
		})
		.where(eq(calendarConnection.id, connection.id));
}

export async function markConnectionStatus(
	connectionId: string,
	status: (typeof calendarConnectionStatus.enumValues)[number],
	failureReason: string | null = null,
) {
	await db
		.update(calendarConnection)
		.set({
			status,
			failureReason,
		})
		.where(eq(calendarConnection.id, connectionId));
}

export async function touchConnectionSynced(connectionId: string) {
	await db
		.update(calendarConnection)
		.set({
			lastSyncedAt: new Date(),
			failureReason: null,
			status: CONNECTED_STATUS,
		})
		.where(eq(calendarConnection.id, connectionId));
}

export async function clearConnectionCredentials(connectionId: string) {
	await db
		.update(calendarConnection)
		.set({
			accessToken: null,
			refreshToken: null,
			tokenExpiresAt: null,
			scope: null,
		})
		.where(eq(calendarConnection.id, connectionId));
}
