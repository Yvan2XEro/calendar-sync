import { randomUUID } from "node:crypto";

import { sql } from "bun";

import type { EventSqlInsert } from "../utils/mailparser";

type EventRow = {
	id: string;
};

function normalizeSlug(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "");
}

function generateSlug({
	title,
	id,
	slug,
}: {
	title: string;
	id: string;
	slug?: string;
}) {
	const provided = slug ? normalizeSlug(slug) : "";
	if (provided) return provided;

	const normalizedTitle = normalizeSlug(title);
	const idSuffix = normalizeSlug(id.split("-")[0] ?? id).slice(0, 12);
	const suffix =
		idSuffix || normalizeSlug(id).slice(0, 12) || randomUUID().slice(0, 8);

	if (normalizedTitle) {
		const candidate = normalizeSlug(`${normalizedTitle}-${suffix}`);
		if (candidate) return candidate;
	}

	return normalizeSlug(`event-${suffix}`) || `event-${id}`;
}

export async function insertEvent(
	values: EventSqlInsert & { id?: string; slug?: string },
): Promise<EventRow | null> {
	const id = values.id ?? randomUUID();
	const slug = generateSlug({ title: values.title, id, slug: values.slug });

	const [row] = await sql<EventRow[]>`
    INSERT INTO event (
      id,
      slug,
      provider_id,
      flag_id,
      external_id,
      title,
      description,
      location,
      url,
      start_at,
      end_at,
      is_all_day,
      is_published,
      metadata,
      priority,
      status
    ) VALUES (
      ${id},
      ${slug},
      ${values.provider_id},
      ${values.flag_id ?? null},
      ${values.external_id ?? null},
      ${values.title},
      ${values.description ?? null},
      ${values.location ?? null},
      ${values.url ?? null},
      ${values.start_at},
      ${values.end_at ?? null},
      ${values.is_all_day ?? false},
      ${values.is_published ?? false},
      ${JSON.stringify(values.metadata ?? {})}::jsonb,
      ${values.priority ?? 3},
      ${values.status ?? "pending"}
    )
    ON CONFLICT (provider_id, external_id) DO NOTHING
    RETURNING id
  `;

	return row ?? null;
}
