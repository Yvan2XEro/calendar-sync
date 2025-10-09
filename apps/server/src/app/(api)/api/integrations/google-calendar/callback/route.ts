import { NextResponse } from "next/server";

import { db } from "@/db";
import { calendarConnection } from "@/db/schema/app";
import { auth } from "@/lib/auth";
import {
	createGoogleOAuthClient,
	type GoogleStoredOAuthCredentials,
	isGoogleOAuthConfigured,
} from "@/lib/integrations/google-calendar";
import {
	getOrganizationBySlug,
	getOrganizationMembership,
	isUserOrganizationAdmin,
} from "@/lib/org-membership";
import { buildAbsoluteUrl } from "@/lib/site-metadata";

function decodeState(raw: string | null): {
	connectionId: string;
	slug: string;
	token: string;
	returnTo?: string | null;
} | null {
	if (!raw) return null;
	try {
		const json = Buffer.from(raw, "base64url").toString("utf8");
		const parsed = JSON.parse(json) as {
			connectionId?: string;
			slug?: string;
			token?: string;
			returnTo?: string | null;
		};
		if (!parsed.connectionId || !parsed.slug || !parsed.token) {
			return null;
		}
		return {
			connectionId: parsed.connectionId,
			slug: parsed.slug,
			token: parsed.token,
			returnTo: parsed.returnTo,
		};
	} catch (error) {
		console.error("Failed to decode Google OAuth state", error);
		return null;
	}
}

function coerceMetadata(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return { ...(value as Record<string, unknown>) };
}

function parseIdToken(idToken?: string | null) {
	if (!idToken) return {} as { email?: string; subject?: string };
	try {
		const [, payload] = idToken.split(".");
		if (!payload) return {} as { email?: string; subject?: string };
		const json = Buffer.from(payload, "base64url").toString("utf8");
		const parsed = JSON.parse(json) as { email?: string; sub?: string };
		return { email: parsed.email, subject: parsed.sub };
	} catch (error) {
		console.error("Failed to parse Google ID token", error);
		return {} as { email?: string; subject?: string };
	}
}

function buildRedirectUrl(
	slug: string,
	status: "success" | "error",
	message?: string | null,
	returnTo?: string | null,
) {
	const base = returnTo?.startsWith("/")
		? returnTo
		: "/account/integrations/calendars";
	const redirectUrl = new URL(base, buildAbsoluteUrl("/"));
	redirectUrl.searchParams.set("organization", slug);
	redirectUrl.searchParams.set("status", status);
	if (message && message.trim().length > 0) {
		redirectUrl.searchParams.set("message", message);
	}
	return redirectUrl.toString();
}

export async function GET(request: Request): Promise<NextResponse> {
	if (!isGoogleOAuthConfigured()) {
		return NextResponse.json(
			{ error: "Google OAuth is not configured" },
			{ status: 500 },
		);
	}

	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const error = url.searchParams.get("error");
	const errorDescription = url.searchParams.get("error_description");
	const state = decodeState(url.searchParams.get("state"));

	if (!state) {
		return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
	}

	const connection = await db.query.calendarConnection.findFirst({
		where: (table, { eq }) => eq(table.id, state.connectionId),
	});

	if (!connection || connection.stateToken !== state.token) {
		return NextResponse.json(
			{ error: "OAuth session has expired" },
			{ status: 400 },
		);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		return NextResponse.json(
			{ error: "Authentication required" },
			{ status: 401 },
		);
	}

	const organization = await getOrganizationBySlug(state.slug);
	if (!organization) {
		return NextResponse.json(
			{ error: "Organization mismatch" },
			{ status: 400 },
		);
	}

	const membership = await getOrganizationMembership({
		organizationId: organization.id,
		userId: session.user.id,
	});

	if (!membership || connection.memberId !== membership.id) {
		return NextResponse.json(
			{ error: "OAuth session is associated with a different member" },
			{ status: 403 },
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

	const metadata = coerceMetadata(connection.metadata);

	if (error) {
		metadata.lastErrorAt = new Date().toISOString();
		metadata.lastError = errorDescription ?? error;
		await db
			.update(calendarConnection)
			.set({
				status: "error",
				failureReason: errorDescription ?? error,
				stateToken: null,
				metadata,
			})
			.where((table, { eq }) => eq(table.id, connection.id));

		const redirectUrl = buildRedirectUrl(
			state.slug,
			"error",
			errorDescription ?? error,
			state.returnTo,
		);
		return NextResponse.redirect(redirectUrl);
	}

	if (!code) {
		metadata.lastErrorAt = new Date().toISOString();
		metadata.lastError = "Missing authorization code";
		await db
			.update(calendarConnection)
			.set({
				status: "error",
				failureReason: "Missing authorization code",
				stateToken: null,
				metadata,
			})
			.where((table, { eq }) => eq(table.id, connection.id));

		const redirectUrl = buildRedirectUrl(
			state.slug,
			"error",
			"Missing authorization code",
			state.returnTo,
		);
		return NextResponse.redirect(redirectUrl);
	}

	const redirectUri = buildAbsoluteUrl(
		"/api/integrations/google-calendar/callback",
	);
	const client = createGoogleOAuthClient(redirectUri);

	try {
		const tokenResponse = await client.getToken({
			code,
			redirect_uri: redirectUri,
		});
		const tokens = tokenResponse.tokens;
		client.setCredentials(tokens);

		const now = new Date();
		const idTokenInfo = parseIdToken(tokens.id_token);
		const credentials: GoogleStoredOAuthCredentials = {
			accessToken: tokens.access_token ?? connection.accessToken ?? "",
			refreshToken:
				tokens.refresh_token ?? connection.refreshToken ?? undefined,
			scope: tokens.scope ?? connection.scope ?? undefined,
		};
		if (tokens.expiry_date) {
			credentials.tokenExpiresAt = new Date(tokens.expiry_date);
		}

		const updatedMetadata = {
			...metadata,
			connectedAt: now.toISOString(),
			connectedBy: session.user.id,
			accountEmail: idTokenInfo.email ?? metadata.accountEmail,
		} satisfies Record<string, unknown>;

		const calendarId = connection.calendarId?.trim().length
			? connection.calendarId
			: "primary";

		await db
			.update(calendarConnection)
			.set({
				accessToken: credentials.accessToken,
				refreshToken: credentials.refreshToken ?? null,
				tokenExpiresAt: credentials.tokenExpiresAt ?? null,
				scope: credentials.scope ?? null,
				status: "connected",
				calendarId,
				externalAccountId:
					idTokenInfo.email ??
					idTokenInfo.subject ??
					connection.externalAccountId,
				failureReason: null,
				stateToken: null,
				metadata: updatedMetadata,
			})
			.where((table, { eq }) => eq(table.id, connection.id));

		const redirectUrl = buildRedirectUrl(
			state.slug,
			"success",
			"Google Calendar connected",
			state.returnTo,
		);
		return NextResponse.redirect(redirectUrl);
	} catch (err) {
		const message =
			(
				err as {
					response?: { data?: { error?: string; error_description?: string } };
				}
			).response?.data?.error_description ||
			(err as { message?: string }).message ||
			"Failed to exchange authorization code";

		metadata.lastErrorAt = new Date().toISOString();
		metadata.lastError = message;

		await db
			.update(calendarConnection)
			.set({
				status: "error",
				failureReason: message,
				stateToken: null,
				metadata,
			})
			.where((table, { eq }) => eq(table.id, connection.id));

		const redirectUrl = buildRedirectUrl(
			state.slug,
			"error",
			message,
			state.returnTo,
		);
		return NextResponse.redirect(redirectUrl);
	}
}
