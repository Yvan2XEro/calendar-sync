import { randomUUID } from "node:crypto";

import { db } from "@/db";
import {
	type EventEmailDelivery,
	eventEmailDelivery,
	type eventEmailStatus,
	type eventEmailType,
	type InsertEventEmailDelivery,
} from "@/db/schema/app";

import type { EmailDeliveryStatus, EmailDeliveryType } from "./types";

type QueueEmailDeliveryInput = {
	eventId: string;
	orderId?: string | null;
	attendeeId?: string | null;
	recipientEmail: string;
	recipientName?: string | null;
	type: EmailDeliveryType;
	metadata?: Record<string, unknown>;
	scheduledAt?: Date;
	replyTo?: string | null;
	subject?: string | null;
	status?: EmailDeliveryStatus;
};

export async function queueEmailDelivery(
	input: QueueEmailDeliveryInput,
): Promise<EventEmailDelivery | null> {
	const payload: InsertEventEmailDelivery = {
		id: randomUUID(),
		eventId: input.eventId,
		orderId: input.orderId ?? null,
		attendeeId: input.attendeeId ?? null,
		recipientEmail: input.recipientEmail,
		recipientName: input.recipientName ?? null,
		type: input.type as (typeof eventEmailType.enumValues)[number],
		status: (input.status ??
			"pending") as (typeof eventEmailStatus.enumValues)[number],
		replyTo: input.replyTo ?? null,
		subject: input.subject ?? null,
		metadata: input.metadata ?? {},
		scheduledAt: input.scheduledAt ?? new Date(),
	};

	const [created] = await db
		.insert(eventEmailDelivery)
		.values(payload)
		.returning();
	return created ?? null;
}
