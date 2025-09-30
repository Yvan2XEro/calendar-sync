import { sql } from "bun";

import type { ProviderRecord } from "../types/provider";

interface RawProviderRow {
        id: string;
        name: string;
        description: string | null;
        category: string;
        status: string;
        config: Record<string, unknown> | null;
        trusted: boolean;
}

function normalizeProvider(row: RawProviderRow): ProviderRecord {
        return {
                id: row.id,
                name: row.name,
                description: row.description,
                category: row.category,
                status: row.status as ProviderRecord["status"],
                trusted: Boolean(row.trusted),
                config: (row.config ?? {}) as ProviderRecord["config"],
        };
}

export async function getActiveProviders(): Promise<ProviderRecord[]> {
        const rows = await sql<RawProviderRow[]>`
    SELECT id, name, description, category, status, config, trusted
    FROM provider
    WHERE status = 'active'
  `;

	return rows.map((row) => normalizeProvider(row));
}

export async function getProviderCursor(
	providerId: string,
): Promise<number | null> {
	const result = await sql<{ cursor: string | null }[]>`
    SELECT config #>> '{runtime,cursor}' AS cursor
    FROM provider
    WHERE id = ${providerId}
    LIMIT 1
  `;

	const raw = result[0]?.cursor;
	if (!raw) return null;
	const parsed = Number.parseInt(raw, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

export async function setProviderCursor(
	providerId: string,
	uid: number,
): Promise<void> {
	await sql`
    UPDATE provider
    SET config = jsonb_set(
      config,
      '{runtime,cursor}',
      to_jsonb(${uid}),
      true
    ),
    updated_at = now()
    WHERE id = ${providerId}
  `;
}
