import { randomUUID } from "node:crypto";

import { sql } from "bun";

import type { EventSqlInsert } from "../utils/mailparser";

type EventRow = {
  id: string;
};

export async function insertEvent(
  values: EventSqlInsert & { id?: string },
): Promise<EventRow | null> {
  const id = values.id ?? randomUUID();

  const [row] = await sql<EventRow[]>`
    INSERT INTO event (
      id,
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
      priority
    ) VALUES (
      ${id},
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
      ${values.priority ?? 3}
    )
    ON CONFLICT (provider_id, external_id) DO NOTHING
    RETURNING id
  `;

  return row ?? null;
}
