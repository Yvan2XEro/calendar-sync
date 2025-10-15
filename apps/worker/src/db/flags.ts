import { sql } from "bun";

export interface FlagRecord {
	id: string;
	slug: string;
	label: string;
}

export async function getFlags(): Promise<FlagRecord[]> {
	const rows = await sql<FlagRecord[]>`
    SELECT id, slug, label
    FROM flag
    ORDER BY label ASC
  `;

	return rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		label: row.label,
	}));
}
