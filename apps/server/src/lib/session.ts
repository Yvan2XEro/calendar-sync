export type SessionLike =
	| (Record<string, unknown> & {
			user?:
				| (Record<string, unknown> & {
						role?: string | null;
						roles?: string[] | null;
				  })
				| null;
	  })
	| null
	| undefined;

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

export function getUserRoles(session: SessionLike): string[] {
	if (!session) return [];
	const user = session.user;
	if (!user || typeof user !== "object") return [];

	const possibleRoles = (user as { roles?: unknown }).roles;
	if (isStringArray(possibleRoles) && possibleRoles.length > 0) {
		return possibleRoles;
	}

	const singleRole = (user as { role?: unknown }).role;
	if (typeof singleRole === "string" && singleRole.length > 0) {
		return [singleRole];
	}

	return [];
}

export function isAdminSession(session: SessionLike): boolean {
	return getUserRoles(session).includes("admin");
}
