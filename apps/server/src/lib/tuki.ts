import { getUserRoles } from "./session";
import type { SessionLike } from "./session";

export async function hydrateSessionWithTukiClaims(
	session: SessionLike,
): Promise<
	| { session: SessionLike; derivedRoles: number }
	| { session: null; derivedRoles: 0 }
> {
	if (!session || typeof session !== "object") {
		return { session: null, derivedRoles: 0 };
	}

	const sessionUser =
		(session as { user?: Record<string, unknown> | null }).user ?? null;

	if (!sessionUser || typeof sessionUser !== "object") {
		return { session: null, derivedRoles: 0 };
	}

	const roles = getUserRoles(session);

	if (roles.length === 0) {
		return { session: null, derivedRoles: 0 };
	}

	(sessionUser as { roles?: string[] }).roles = roles;
	(sessionUser as { tukiTier?: string | null }).tukiTier = null;
	(sessionUser as { tukiOrganizations?: string[] }).tukiOrganizations = [];

	return { session, derivedRoles: roles.length };
}
