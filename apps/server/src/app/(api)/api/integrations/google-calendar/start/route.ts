import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { db } from "@/db";
import { calendarConnection } from "@/db/schema/app";
import { auth } from "@/lib/auth";
import {
	createGoogleOAuthClient,
	GOOGLE_OAUTH_SCOPES,
	isGoogleOAuthConfigured,
} from "@/lib/integrations/google-calendar";
import {
	getOrganizationBySlug,
	isUserOrganizationAdmin,
} from "@/lib/org-membership";
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

export async function GET(request: Request): Promise<NextResponse> {
	if (!isGoogleOAuthConfigured()) {
		return NextResponse.json(
			{ error: "Google OAuth is not configured" },
			{ status: 500 },
		);
	}

	const url = new URL(request.url);
	const slug =
		url.searchParams.get("organization") ?? url.searchParams.get("slug");
	const returnTo = url.searchParams.get("returnTo");

	if (!slug || slug.trim().length === 0) {
		return NextResponse.json(
			{ error: "Organization slug is required" },
			{ status: 400 },
		);
	}

	const session = await auth.api.getSession({
		headers: request.headers,
	});

	if (!session?.user?.id) {
		return NextResponse.json(
			{ error: "Authentication required" },
			{ status: 401 },
		);
	}

	const organization = await getOrganizationBySlug(slug);
	if (!organization) {
		return NextResponse.json(
			{ error: "Organization not found" },
			{ status: 404 },
		);
	}

	const isAdmin = await isUserOrganizationAdmin({
		organizationId: organization.id,
		userId: session.user.id,
	});

	if (!isAdmin) {
		return NextResponse.json(
			{ error: "Administrator permissions are required" },
			{ status: 403 },
		);
	}

	const existing = await db.query.calendarConnection.findFirst({
		where: (table, { and, eq }) =>
			and(
				eq(table.organizationId, organization.id),
				eq(table.userId, session.user.id),
				eq(table.providerType, "google"),
			),
	});

	const stateToken = randomUUID();
	const metadata = parseMetadata(existing?.metadata);
	metadata.lastConnectionStartAt = new Date().toISOString();
	metadata.lastConnectionStartedBy = session.user.id;

	let connectionId: string;

	if (!existing) {
		connectionId = randomUUID();
		await db.insert(calendarConnection).values({
			id: connectionId,
			organizationId: organization.id,
			userId: session.user.id,
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
	const state = buildState({
		connectionId,
		slug,
		token: stateToken,
		returnTo: returnTo?.startsWith("/") ? returnTo : null,
	});
	const authorizationUrl = client.generateAuthUrl({
		access_type: "offline",
		scope: GOOGLE_OAUTH_SCOPES,
		include_granted_scopes: true,
		prompt: "consent",
		state,
	});

	return NextResponse.redirect(authorizationUrl);
}
