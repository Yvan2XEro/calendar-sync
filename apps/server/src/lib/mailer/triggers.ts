import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
	attendee,
	event,
	eventEmailDelivery,
	eventOrder,
} from "@/db/schema/app";
import { parseEventMessagingSettings } from "@/lib/events/messaging";

import { queueEmailDelivery } from "./deliveries";
import type { EmailDeliveryType } from "./types";

function resolveReplyToEmail(
	settingsReplyTo: string | null | undefined,
): string | null {
	if (settingsReplyTo) return settingsReplyTo;
	const fallback = process.env.TRANSACTIONAL_EMAIL_REPLY_TO;
	return fallback && fallback.trim().length > 0 ? fallback.trim() : null;
}

async function hasExistingDelivery(orderId: string, type: EmailDeliveryType) {
	const existing = await db
		.select({
			id: eventEmailDelivery.id,
			status: eventEmailDelivery.status,
		})
		.from(eventEmailDelivery)
		.where(
			and(
				eq(eventEmailDelivery.orderId, orderId),
				eq(eventEmailDelivery.type, type),
			),
		);
	return existing.some((record) => record.status !== "failed");
}

export async function queueOrderConfirmationEmail(orderId: string) {
	if (await hasExistingDelivery(orderId, "confirmation")) {
		return null;
	}

	const [orderRecord] = await db
		.select()
		.from(eventOrder)
		.where(eq(eventOrder.id, orderId))
		.limit(1);
	if (!orderRecord) return null;
	if (orderRecord.status !== "confirmed") return null;
	if (!orderRecord.contactEmail) return null;

	const [eventRecord] = await db
		.select()
		.from(event)
		.where(eq(event.id, orderRecord.eventId))
		.limit(1);
	if (!eventRecord) return null;

	const attendeeRows = await db
		.select({ id: attendee.id })
		.from(attendee)
		.where(eq(attendee.orderId, orderRecord.id));

	const messaging = parseEventMessagingSettings(
		eventRecord.metadata as Record<string, unknown> | null | undefined,
	);
	const replyTo = resolveReplyToEmail(messaging.replyToEmail ?? null);

	return await queueEmailDelivery({
		eventId: eventRecord.id,
		orderId: orderRecord.id,
		recipientEmail: orderRecord.contactEmail,
		recipientName: orderRecord.contactName ?? null,
		type: "confirmation",
		replyTo,
		metadata: {
			reason: "registration_confirmed",
			attendeeIds: attendeeRows.map((row) => row.id),
		},
	});
}
