import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createGoogleOAuthAuthorizationUrl } from "@/lib/calendar-connections/google-oauth";
import { isGoogleOAuthConfigured } from "@/lib/integrations/google-calendar";
import {
	getOrganizationBySlug,
	getOrganizationMembership,
	isUserOrganizationAdmin,
} from "@/lib/org-membership";

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

	const membership = await getOrganizationMembership({
		organizationId: organization.id,
		userId: session.user.id,
	});

	if (!membership) {
		return NextResponse.json(
			{ error: "Membership not found" },
			{ status: 403 },
		);
	}

	const { authorizationUrl } = await createGoogleOAuthAuthorizationUrl({
		organizationId: organization.id,
		memberId: membership.id,
		slug,
		userId: session.user.id,
		returnTo,
	});

	return NextResponse.redirect(authorizationUrl);
}
