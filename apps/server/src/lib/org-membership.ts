import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { member, organization } from "@/db/schema/auth";

const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function getOrganizationBySlug(slug: string) {
	const normalized = slug.trim();
	if (!normalized) return null;
	return db.query.organization.findFirst({
		where: eq(organization.slug, normalized),
	});
}

export async function getOrganizationMembership({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}) {
	return db.query.member.findFirst({
		where: and(
			eq(member.organizationId, organizationId),
			eq(member.userId, userId),
		),
	});
}

export async function isUserOrganizationAdmin({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): Promise<boolean> {
	const membership = await getOrganizationMembership({
		organizationId,
		userId,
	});
	if (!membership) return false;
	return ADMIN_ROLES.has(membership.role);
}

export { ADMIN_ROLES };
