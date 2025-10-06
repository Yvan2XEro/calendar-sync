import { buildRoleSet, extractTukiClaims } from "./tuki";

export type SessionLike =
	| (Record<string, unknown> & {
			user?:
				| (Record<string, unknown> & {
						role?: string | null;
						roles?: string[] | null;
						tukiTier?: string | null;
						tukiOrganizations?: string[] | null;
				  })
				| null;
	  })
	| null
	| undefined;

export function getUserRoles(session: SessionLike): string[] {
	if (!session) return [];
	const user = session.user;
	if (!user || typeof user !== "object") return [];

	const record = user as Record<string, unknown> & {
		role?: string | null;
		roles?: string[] | null;
	};

	const baseRoles = new Set<string>();
	if (Array.isArray(record.roles)) {
		for (const role of record.roles) {
			if (typeof role === "string" && role.trim().length > 0) {
				baseRoles.add(role);
			}
		}
	}

	if (typeof record.role === "string" && record.role.trim().length > 0) {
		baseRoles.add(record.role);
	}

	const claims = extractTukiClaims(record);
	const { roles } = buildRoleSet(baseRoles, claims);
	return roles;
}

export function isAdminSession(session: SessionLike): boolean {
	return getUserRoles(session).includes("admin");
}
