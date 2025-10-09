import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { calendarConnection } from "@/db/schema/app";
import {
	createGoogleOAuthClient,
	GOOGLE_OAUTH_SCOPES,
} from "@/lib/integrations/google-calendar";
import { buildAbsoluteUrl } from "@/lib/site-metadata";

function parseMetadata(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return { ...(value as Record<string, unknown>) };
}

function buildState(payload: Record<string, unknown>): string {
	const json = JSON.stringify(payload);
	return Buffer.from(json, "utf8").toString("base64url");
}

export async function createGoogleOAuthAuthorizationUrl({
	memberId,
	slug,
	userId,
	returnTo,
}: {
	memberId: string;
	slug: string;
	userId: string;
	returnTo?: string | null;
}): Promise<{
	authorizationUrl: string;
	connectionId: string;
}> {
	const existing = await db.query.calendarConnection.findFirst({
		where: (table, { and, eq }) =>
			and(eq(table.memberId, memberId), eq(table.providerType, "google")),
	});

	const stateToken = randomUUID();
	const metadata = parseMetadata(existing?.metadata);
	metadata.lastConnectionStartAt = new Date().toISOString();
	metadata.lastConnectionStartedBy = userId;

	let connectionId: string;

	if (!existing) {
		connectionId = randomUUID();
		await db.insert(calendarConnection).values({
			id: connectionId,
			memberId,
			providerType: "google",
			status: "pending",
			stateToken,
			metadata,
		});
	} else {
		connectionId = existing.id;
		await db
			.update(calendarConnection)
			.set({
				status: "pending",
				stateToken,
				failureReason: null,
				metadata,
			})
			.where((table, { eq }) => eq(table.id, existing.id));
	}

	const redirectUri = buildAbsoluteUrl(
		"/api/integrations/google-calendar/callback",
	);
	const client = createGoogleOAuthClient(redirectUri);
	const sanitizedReturnTo =
		returnTo && returnTo.startsWith("/") ? returnTo : null;
	const state = buildState({
		connectionId,
		slug,
		token: stateToken,
		returnTo: sanitizedReturnTo,
	});
	const authorizationUrl = client.generateAuthUrl({
		access_type: "offline",
		scope: GOOGLE_OAUTH_SCOPES,
		include_granted_scopes: true,
		prompt: "consent",
		state,
	});

	return { authorizationUrl, connectionId };
}
