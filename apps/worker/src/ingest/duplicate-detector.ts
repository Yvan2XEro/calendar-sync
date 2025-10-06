import { sql } from "bun";

import type { EventSqlInsert } from "../utils/mailparser";
import type { DuplicateCheckResult, IngestContext } from "./types";

const DUPLICATE_LOOKBACK_MINUTES = 60 * 24 * 7; // one week

function createLookbackWindow(startAt: string | null | undefined): Date | null {
	if (!startAt) return null;
	const date = new Date(startAt);
	if (Number.isNaN(date.getTime())) return null;
	const lookback = new Date(
		date.getTime() - DUPLICATE_LOOKBACK_MINUTES * 60_000,
	);
	return lookback;
}

async function findDuplicateByExternalId(
	extraction: EventSqlInsert,
): Promise<string | null> {
	if (!extraction.external_id) return null;
	const [row] = await sql<{ id: string }[]>`
                SELECT id
                FROM event
                WHERE provider_id = ${extraction.provider_id}
                  AND external_id = ${extraction.external_id}
                LIMIT 1
        `;
	return row?.id ?? null;
}

async function findDuplicateByTitleAndTime(
	extraction: EventSqlInsert,
): Promise<string | null> {
	const lookback = createLookbackWindow(extraction.start_at);
	if (!lookback) return null;

	const [row] = await sql<{ id: string }[]>`
                SELECT id
                FROM event
                WHERE provider_id = ${extraction.provider_id}
                  AND lower(title) = lower(${extraction.title})
                  AND start_at BETWEEN ${lookback.toISOString()}::timestamptz AND ${
										extraction.start_at
									}::timestamptz
                ORDER BY start_at DESC
                LIMIT 1
        `;
	return row?.id ?? null;
}

async function findDuplicateByUrl(
	extraction: EventSqlInsert,
): Promise<string | null> {
	if (!extraction.url) return null;
	const [row] = await sql<{ id: string }[]>`
                SELECT id
                FROM event
                WHERE provider_id = ${extraction.provider_id}
                  AND metadata ->> 'source_url' = ${extraction.url}
                LIMIT 1
        `;
	return row?.id ?? null;
}

export async function detectDuplicate(
	extraction: EventSqlInsert,
	context: IngestContext,
): Promise<DuplicateCheckResult> {
	const reasons: string[] = [];
	let existing: string | null = null;

	existing = await findDuplicateByExternalId(extraction);
	if (existing) {
		reasons.push("external_id_match");
	}

	if (!existing) {
		existing = await findDuplicateByTitleAndTime(extraction);
		if (existing) {
			reasons.push("title_time_window_match");
		}
	}

	if (!existing) {
		existing = await findDuplicateByUrl(extraction);
		if (existing) {
			reasons.push("source_url_match");
		}
	}

	const duplicate = Boolean(existing);

	if (duplicate) {
		context.metrics.incrementCounter(
			"worker_ingest_duplicate_detected_total",
			1,
			{
				provider_id: context.provider.id,
				mailbox: context.message.mailbox,
			},
		);
		context.logger.info("Duplicate detected prior to insert", {
			mailbox: context.message.mailbox,
			uid: context.message.uid,
			reasons,
			existingEventId: existing,
		});
	}

	return {
		duplicate,
		reasons,
		existingEventId: existing,
		scorePenalty: duplicate ? 0.3 : 0,
	} satisfies DuplicateCheckResult;
}
