import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { account } from "@/db/schema/auth";

import type { SessionLike } from "./session";

const ROLE_KEY_SET = new Set([
	"https://tuki.app/roles",
	"https://tuki.app/claims/roles",
	"tuki_roles",
	"tukiroles",
]);

const TIER_KEY_SET = new Set([
	"https://tuki.app/tier",
	"https://tuki.app/claims/tier",
	"tuki_tier",
	"tukitier",
	"tier",
]);

const ORGANIZATION_KEY_SET = new Set([
	"https://tuki.app/organizations",
	"https://tuki.app/claims/organizations",
	"tuki_organizations",
	"tukiorganizations",
	"organizations",
	"organization",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function toOptionalString(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return null;
}

function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.flatMap((item) => toStringArray(item))
			.map((item) => item.trim())
			.filter((item) => item.length > 0);
	}

	const asString = toOptionalString(value);
	if (asString) {
		return [asString];
	}

	if (isRecord(value)) {
		const collected: string[] = [];
		for (const nested of Object.values(value)) {
			collected.push(...toStringArray(nested));
		}
		return collected;
	}

	return [];
}

function toOrganizationArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.flatMap((item) => toOrganizationArray(item))
			.filter(
				(item): item is string => typeof item === "string" && item.length > 0,
			);
	}

	if (isRecord(value)) {
		const slug = toOptionalString(value.slug);
		const id = toOptionalString(value.id);
		const name = toOptionalString(value.name);

		const identifiers = [slug, id, name].filter(
			(identifier): identifier is string =>
				typeof identifier === "string" && identifier.length > 0,
		);

		if (identifiers.length > 0) {
			return identifiers;
		}

		const collected: string[] = [];
		for (const nested of Object.values(value)) {
			collected.push(...toOrganizationArray(nested));
		}
		return collected;
	}

	const asString = toOptionalString(value);
	return asString ? [asString] : [];
}

function shouldInspectKey(key: string): boolean {
	return (
		key.includes("metadata") ||
		key.includes("claims") ||
		key.includes("tuki") ||
		key.includes("app")
	);
}

function isRoleKey(key: string): boolean {
	if (ROLE_KEY_SET.has(key)) return true;
	return key.includes("tuki") && key.includes("role");
}

function isTierKey(key: string): boolean {
	if (TIER_KEY_SET.has(key)) return true;
	return key.includes("tuki") && key.includes("tier");
}

function isOrganizationKey(key: string): boolean {
	if (ORGANIZATION_KEY_SET.has(key)) return true;
	return key.includes("tuki") && (key.includes("org") || key.includes("team"));
}

export type TukiClaims = {
	roles: string[];
	tier: string | null;
	organizations: string[];
};

export function extractTukiClaims(
	source: Record<string, unknown> | null | undefined,
): TukiClaims {
	const roles = new Set<string>();
	const organizations = new Set<string>();
	let tier: string | null = null;

	if (!source || typeof source !== "object") {
		return { roles: [], tier: null, organizations: [] };
	}

	const stack: Record<string, unknown>[] = [source];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;

		for (const [rawKey, value] of Object.entries(current)) {
			const key = rawKey.toLowerCase();

			if (isRoleKey(key)) {
				for (const role of toStringArray(value)) {
					if (role) {
						roles.add(role);
					}
				}
				continue;
			}

			if (isTierKey(key) && tier === null) {
				tier = toOptionalString(value);
				if (tier) {
					tier = tier;
				}
			}

			if (isOrganizationKey(key)) {
				for (const identifier of toOrganizationArray(value)) {
					if (identifier) {
						organizations.add(identifier);
					}
				}
			}

			if (Array.isArray(value)) {
				for (const item of value) {
					if (isRecord(item)) {
						stack.push(item);
					}
				}
				continue;
			}

			if (isRecord(value) && shouldInspectKey(key)) {
				stack.push(value);
			}
		}
	}

	return {
		roles: Array.from(roles),
		tier,
		organizations: Array.from(organizations),
	};
}

function normalizeRoleValue(value: string): string {
	return value.trim().toLowerCase();
}

function normalizeRoleSegment(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export type DerivedRolesResult = {
	roles: string[];
	derivedCount: number;
};

export function buildRoleSet(
	baseRoles: Iterable<string>,
	claims: TukiClaims,
): DerivedRolesResult {
	const normalized = new Set<string>();
	let derivedCount = 0;

	for (const role of baseRoles) {
		const normalizedRole = normalizeRoleValue(role);
		if (normalizedRole.length > 0) {
			normalized.add(normalizedRole);
		}
	}

	for (const role of claims.roles) {
		const normalizedRole = normalizeRoleValue(role);
		if (normalizedRole.length > 0 && !normalized.has(normalizedRole)) {
			normalized.add(normalizedRole);
			derivedCount++;
		}
	}

	if (claims.tier) {
		const tierRole = `tier:${normalizeRoleSegment(claims.tier)}`;
		if (tierRole.length > 5 && !normalized.has(tierRole)) {
			normalized.add(tierRole);
			derivedCount++;
		}
	}

	for (const organization of claims.organizations) {
		const orgRole = `org:${normalizeRoleSegment(organization)}`;
		if (orgRole.length > 4 && !normalized.has(orgRole)) {
			normalized.add(orgRole);
			derivedCount++;
		}
	}

	return {
		roles: Array.from(normalized),
		derivedCount,
	};
}

export function decodeJwtClaims(
	token: string | null | undefined,
): Record<string, unknown> | null {
	if (!token) return null;

	const segments = token.split(".");
	if (segments.length < 2) return null;

	try {
		const payload = segments[1];
		const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
		const paddingLength = normalizedPayload.length % 4;
		const paddedPayload =
			paddingLength === 0
				? normalizedPayload
				: normalizedPayload.padEnd(
						normalizedPayload.length + (4 - paddingLength),
						"=",
					);
		const decoded = Buffer.from(paddedPayload, "base64").toString("utf8");
		const parsed = JSON.parse(decoded) as unknown;
		if (isRecord(parsed)) {
			return parsed;
		}
	} catch (error) {
		console.error("Failed to decode JWT payload", error);
	}

	return null;
}

export async function loadTukiClaimsFromAccount(
	userId: string,
	providerId: string,
): Promise<TukiClaims | null> {
	if (!userId || !providerId) return null;

	const [row] = await db
		.select({
			idToken: account.idToken,
			accessToken: account.accessToken,
			scope: account.scope,
		})
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
		.orderBy(desc(account.updatedAt))
		.limit(1);

	const claimsSource = decodeJwtClaims(row?.idToken ?? null);
	if (!claimsSource) {
		return null;
	}

	return extractTukiClaims(claimsSource);
}

export async function hydrateSessionWithTukiClaims(
	session: SessionLike,
	providerId: string,
): Promise<
	| { session: SessionLike; derivedRoles: number }
	| { session: null; derivedRoles: 0 }
> {
	if (!session) {
		return { session: null, derivedRoles: 0 };
	}

	const sessionUser =
		session && typeof session === "object"
			? (session as { user?: Record<string, unknown> | null }).user
			: null;

	if (!sessionUser || typeof sessionUser !== "object") {
		return { session, derivedRoles: 0 };
	}

	const user = sessionUser as Record<string, unknown> & {
		id?: string;
		role?: string | null;
		roles?: string[] | null;
	};

	const baseRoles = new Set<string>();
	if (Array.isArray(user.roles)) {
		for (const role of user.roles) {
			if (typeof role === "string" && role.trim().length > 0) {
				baseRoles.add(role);
			}
		}
	}

	if (typeof user.role === "string" && user.role.trim().length > 0) {
		baseRoles.add(user.role);
	}

	let claims = extractTukiClaims(user);

	if (
		claims.roles.length === 0 &&
		!claims.tier &&
		claims.organizations.length === 0 &&
		user.id
	) {
		const fromAccount = await loadTukiClaimsFromAccount(user.id, providerId);
		if (fromAccount) {
			claims = {
				roles: fromAccount.roles.length > 0 ? fromAccount.roles : claims.roles,
				tier: fromAccount.tier ?? claims.tier,
				organizations:
					fromAccount.organizations.length > 0
						? fromAccount.organizations
						: claims.organizations,
			};
		}
	}

	const { roles, derivedCount } = buildRoleSet(baseRoles, claims);

	(user as { roles?: string[] }).roles = roles;
	(user as { tukiTier?: string | null }).tukiTier = claims.tier ?? null;
	(user as { tukiOrganizations?: string[] }).tukiOrganizations =
		claims.organizations;

	if (roles.length === 0 || derivedCount === 0) {
		return { session: null, derivedRoles: 0 };
	}

	return { session, derivedRoles: derivedCount };
}
