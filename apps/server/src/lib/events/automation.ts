import { randomUUID } from "node:crypto";

import type { db } from "@/db";
import {
	eventAutomationJob,
	eventAutomationStatus,
	type eventAutomationType,
} from "@/db/schema/app";

export type TransactionClient = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

type DatabaseClient = typeof db | TransactionClient;

export type EventAutomationType =
	(typeof eventAutomationType.enumValues)[number];
export type EventAutomationStatus =
	(typeof eventAutomationStatus.enumValues)[number];

export type AutomationJobRequest = {
	eventId: string;
	type: EventAutomationType;
	payload?: Record<string, unknown>;
	scheduledAt?: Date;
	status?: EventAutomationStatus;
};

const DEFAULT_STATUS: EventAutomationStatus =
	eventAutomationStatus.enumValues[0];

export async function enqueueEventAutomations(
	client: DatabaseClient,
	jobs: AutomationJobRequest[],
): Promise<void> {
	if (!jobs.length) return;

	const rows = jobs.map(
		(job) =>
			({
				id: randomUUID(),
				eventId: job.eventId,
				type: job.type,
				status: job.status ?? DEFAULT_STATUS,
				payload: job.payload ?? {},
				scheduledAt: job.scheduledAt ?? new Date(),
			}) satisfies typeof eventAutomationJob.$inferInsert,
	);

	await client
		.insert(eventAutomationJob)
		.values(rows)
		.onConflictDoNothing({
			target: [
				eventAutomationJob.eventId,
				eventAutomationJob.type,
				eventAutomationJob.status,
			],
		});
}
