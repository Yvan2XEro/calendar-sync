import { Buffer } from "node:buffer";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { event, eventEmailDelivery, eventOrder } from "@/db/schema/app";
import { buildICS } from "@/lib/calendar-links";
import { formatDisplayDate } from "@/lib/datetime";
import {
	DEFAULT_REMINDER_CADENCE_HOURS,
	parseEventMessagingSettings,
} from "@/lib/events/messaging";

import { queueEmailDelivery } from "./deliveries";
import { sendTransactionalEmail } from "./service";
import type { MailerAttachment, MailerMessage } from "./types";

type DeliveryContext = {
	delivery: {
		id: string;
		eventId: string;
		orderId: string | null;
		type: (typeof eventEmailDelivery.type.enumValues)[number];
		status: (typeof eventEmailDelivery.status.enumValues)[number];
		metadata: Record<string, unknown>;
		recipientEmail: string;
		recipientName: string | null;
		attemptCount: number;
		scheduledAt: Date;
		replyTo: string | null;
		subject: string | null;
	};
	event: {
		id: string;
		title: string;
		description: string | null;
		location: string | null;
		url: string | null;
		startAt: Date;
		endAt: Date | null;
		metadata: Record<string, unknown> | null;
	};
	order: {
		id: string;
		contactEmail: string | null;
		contactName: string | null;
		confirmationCode: string | null;
	} | null;
};

const DEFAULT_LOOKAHEAD_DAYS = 7;
const FOLLOW_UP_DELAY_HOURS = 24;
const FOLLOW_UP_LOOKBACK_HOURS = 72;

function resolveReplyToEmail(
	eventReplyTo: string | null | undefined,
	deliveryReplyTo: string | null | undefined,
) {
	if (deliveryReplyTo) return deliveryReplyTo;
	if (eventReplyTo) return eventReplyTo;
	const fallback = process.env.TRANSACTIONAL_EMAIL_REPLY_TO;
	return fallback && fallback.trim().length > 0 ? fallback.trim() : null;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function safeUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		return new URL(value).toString();
	} catch {
		return null;
	}
}

function toSafeFileName(title: string, fallback: string): string {
	const base = title.trim().length > 0 ? title.trim() : fallback;
	return base
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
}

function buildIcsAttachment(context: DeliveryContext) {
	const ics = buildICS({
		id: context.event.id,
		title: context.event.title,
		startAt: context.event.startAt,
		endAt: context.event.endAt,
		description: context.event.description ?? undefined,
		location: context.event.location ?? undefined,
		url: context.event.url ?? undefined,
		metadata: context.event.metadata ?? undefined,
	});
	const fileName = `${toSafeFileName(context.event.title, "event") || "event"}.ics`;
	return {
		filename: fileName,
		content: Buffer.from(ics, "utf8"),
		contentType: "text/calendar",
	} satisfies MailerAttachment;
}

function formatEventDetails(context: DeliveryContext) {
	const parts: string[] = [];
	parts.push(
		`<p><strong>Starts:</strong> ${escapeHtml(formatDisplayDate(context.event.startAt))}</p>`,
	);
	if (context.event.location) {
		parts.push(
			`<p><strong>Location:</strong> ${escapeHtml(context.event.location)}</p>`,
		);
	}
	const url = safeUrl(context.event.url);
	if (url) {
		parts.push(
			`<p><strong>More info:</strong> <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
		);
	}
	return parts.join("");
}

function formatEventDetailsText(context: DeliveryContext) {
	const parts: string[] = [];
	parts.push(`Starts: ${formatDisplayDate(context.event.startAt)}`);
	if (context.event.location) {
		parts.push(`Location: ${context.event.location}`);
	}
	if (context.event.url) {
		parts.push(`More info: ${context.event.url}`);
	}
	return parts.join("\n");
}

function reminderOffsetFromMetadata(
	metadata: Record<string, unknown>,
): number | null {
	const raw = metadata.offsetHours ?? metadata.offset_hours;
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return Math.trunc(raw);
	}
	if (typeof raw === "string") {
		const parsed = Number(raw);
		if (Number.isFinite(parsed)) return Math.trunc(parsed);
	}
	return null;
}

function defaultSubjectForType(
	type: (typeof eventEmailDelivery.type.enumValues)[number],
	eventTitle: string,
	offsetHours: number | null,
): string {
	switch (type) {
		case "confirmation":
			return `Registration confirmed: ${eventTitle}`;
		case "reminder":
			if (offsetHours && offsetHours > 0) {
				return `Reminder: ${eventTitle} starts in ${offsetHours} hour${offsetHours === 1 ? "" : "s"}`;
			}
			return `Reminder: ${eventTitle} is coming up`;
		case "cancellation":
			return `Update: ${eventTitle} has been cancelled`;
		case "follow_up":
			return `Thanks for joining ${eventTitle}`;
		case "announcement":
			return `Announcement: ${eventTitle}`;
		default:
			return `Update for ${eventTitle}`;
	}
}

function buildEmailCopy(
	context: DeliveryContext,
	intro: string,
	extra?: { html?: string[]; text?: string[] },
) {
	const greeting = context.order?.contactName
		? `Hi ${escapeHtml(context.order.contactName)},`
		: "Hi there,";
	const htmlParts = [
		`<p>${greeting}</p>`,
		`<p>${escapeHtml(intro)}</p>`,
		formatEventDetails(context),
	];
	const textParts = [
		context.order?.contactName
			? `Hi ${context.order.contactName},`
			: "Hi there,",
		intro,
		"",
		formatEventDetailsText(context),
	];
	if (extra?.html?.length) {
		htmlParts.push(...extra.html);
	}
	if (extra?.text?.length) {
		textParts.push("", ...extra.text);
	}
	return {
		html: htmlParts.join("\n"),
		text: textParts.join("\n"),
	};
}

export async function processPendingEmailDeliveries({ limit = 20 } = {}) {
	const now = new Date();
	const rows = await db
		.select({
			delivery: {
				id: eventEmailDelivery.id,
				eventId: eventEmailDelivery.eventId,
				orderId: eventEmailDelivery.orderId,
				type: eventEmailDelivery.type,
				status: eventEmailDelivery.status,
				metadata: eventEmailDelivery.metadata,
				recipientEmail: eventEmailDelivery.recipientEmail,
				recipientName: eventEmailDelivery.recipientName,
				attemptCount: eventEmailDelivery.attemptCount,
				scheduledAt: eventEmailDelivery.scheduledAt,
				replyTo: eventEmailDelivery.replyTo,
				subject: eventEmailDelivery.subject,
			},
			event: {
				id: event.id,
				title: event.title,
				description: event.description,
				location: event.location,
				url: event.url,
				startAt: event.startAt,
				endAt: event.endAt,
				metadata: event.metadata,
			},
			order: {
				id: eventOrder.id,
				contactEmail: eventOrder.contactEmail,
				contactName: eventOrder.contactName,
				confirmationCode: eventOrder.confirmationCode,
			},
		})
		.from(eventEmailDelivery)
		.innerJoin(event, eq(event.id, eventEmailDelivery.eventId))
		.leftJoin(eventOrder, eq(eventOrder.id, eventEmailDelivery.orderId))
		.where(
			and(
				eq(eventEmailDelivery.status, "pending"),
				lte(eventEmailDelivery.scheduledAt, now),
			),
		)
		.orderBy(eventEmailDelivery.scheduledAt)
		.limit(limit);

	let attempted = 0;
	let sent = 0;
	let failed = 0;

	for (const row of rows) {
		const context: DeliveryContext = {
			delivery: {
				...row.delivery,
				metadata: (row.delivery.metadata ?? {}) as Record<string, unknown>,
			},
			event: {
				...row.event,
				metadata: (row.event.metadata ?? null) as Record<
					string,
					unknown
				> | null,
			},
			order: row.order?.id ? row.order : null,
		};

		const update = await db
			.update(eventEmailDelivery)
			.set({
				status: "sending",
				attemptCount: context.delivery.attemptCount + 1,
				updatedAt: sql`now()`,
			})
			.where(
				and(
					eq(eventEmailDelivery.id, context.delivery.id),
					eq(eventEmailDelivery.status, "pending"),
				),
			)
			.returning({ attemptCount: eventEmailDelivery.attemptCount });
		if (!update.length) {
			continue;
		}
		context.delivery.attemptCount = update[0].attemptCount;
		attempted += 1;

		const settings = parseEventMessagingSettings(context.event.metadata ?? {});
		const offsetHours = reminderOffsetFromMetadata(context.delivery.metadata);
		const settingsSubjectOverride = (() => {
			switch (context.delivery.type) {
				case "confirmation":
					return settings.confirmationSubject;
				case "reminder":
					return settings.reminderSubject;
				case "cancellation":
					return settings.cancellationSubject;
				case "follow_up":
					return settings.followUpSubject;
				default:
					return settings.updateSubject;
			}
		})();
		const subject =
			context.delivery.subject ??
			settingsSubjectOverride ??
			defaultSubjectForType(
				context.delivery.type,
				context.event.title,
				offsetHours,
			);
		const replyTo = resolveReplyToEmail(
			settings.replyToEmail ?? null,
			context.delivery.replyTo,
		);
		let intro = (() => {
			switch (context.delivery.type) {
				case "confirmation":
					return "Your registration is confirmed. Save the details below.";
				case "reminder":
					return offsetHours && offsetHours > 0
						? `Your event begins in about ${offsetHours} hour${offsetHours === 1 ? "" : "s"}.`
						: "Your event begins soon. Here's a quick reminder.";
				case "cancellation":
					return "Unfortunately, this event has been cancelled.";
				case "follow_up":
					return "Thanks again for joining us. We'd love to stay in touch.";
				case "announcement":
					return "Here's the latest update for your event.";
				default:
					return "We've updated the event details below.";
			}
		})();
		const extras = { html: [] as string[], text: [] as string[] };
		if (context.delivery.type === "announcement") {
			const bodyHtml = (() => {
				const value = context.delivery.metadata.bodyHtml;
				return typeof value === "string" && value.trim().length > 0
					? value
					: null;
			})();
			const bodyText = (() => {
				const value = context.delivery.metadata.bodyText;
				return typeof value === "string" && value.trim().length > 0
					? value
					: null;
			})();
			const preview = (() => {
				const value = context.delivery.metadata.previewText;
				return typeof value === "string" && value.trim().length > 0
					? value.trim()
					: null;
			})();
			if (preview) {
				intro = preview;
			} else if (bodyText) {
				const firstLine = bodyText
					.split("\n")
					.map((line) => line.trim())
					.find((line) => line.length > 0);
				if (firstLine) {
					intro = firstLine;
				}
			}
			if (bodyHtml) {
				extras.html.push(bodyHtml);
			}
			if (bodyText) {
				extras.text.push(bodyText);
			}
		}
		if (
			context.delivery.type === "confirmation" &&
			context.order?.confirmationCode
		) {
			extras.html.push(
				`<p><strong>Confirmation code:</strong> ${escapeHtml(context.order.confirmationCode)}</p>`,
			);
			extras.text.push(`Confirmation code: ${context.order.confirmationCode}`);
		}
		const copy = buildEmailCopy(context, intro, extras);
		const attachments: MailerAttachment[] = [];
		if (
			context.delivery.type === "confirmation" ||
			context.delivery.type === "reminder" ||
			context.delivery.type === "update" ||
			context.delivery.type === "announcement"
		) {
			attachments.push(buildIcsAttachment(context));
		}
		if (!context.delivery.recipientEmail) {
			failed += 1;
			await db
				.update(eventEmailDelivery)
				.set({
					status: "failed",
					lastError: "Recipient email is missing",
					subject,
					replyTo,
					updatedAt: sql`now()`,
				})
				.where(eq(eventEmailDelivery.id, context.delivery.id));
			continue;
		}

		const message: MailerMessage = {
			to: context.delivery.recipientEmail,
			subject,
			html: copy.html,
			text: copy.text,
			replyTo,
			attachments,
		};

		const result = await sendTransactionalEmail(message);
		if (result.success) {
			sent += 1;
			await db
				.update(eventEmailDelivery)
				.set({
					status: "sent",
					sentAt: sql`now()`,
					providerMessageId: result.id ?? null,
					subject,
					replyTo,
					lastError: null,
					updatedAt: sql`now()`,
				})
				.where(eq(eventEmailDelivery.id, context.delivery.id));
		} else {
			failed += 1;
			await db
				.update(eventEmailDelivery)
				.set({
					status: "failed",
					lastError: result.error,
					subject,
					replyTo,
					updatedAt: sql`now()`,
				})
				.where(eq(eventEmailDelivery.id, context.delivery.id));
		}
	}

	return { attempted, sent, failed } as const;
}

export async function scheduleEventCommunications({ limit = 200 } = {}) {
	const now = new Date();
	const lookback = new Date(
		now.getTime() - FOLLOW_UP_LOOKBACK_HOURS * 60 * 60 * 1000,
	);
	const horizon = new Date(
		now.getTime() + DEFAULT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
	);
	const rows = await db
		.select({
			orderId: eventOrder.id,
			contactEmail: eventOrder.contactEmail,
			contactName: eventOrder.contactName,
			eventId: event.id,
			eventTitle: event.title,
			eventStart: event.startAt,
			eventEnd: event.endAt,
			eventMetadata: event.metadata,
		})
		.from(eventOrder)
		.innerJoin(event, eq(event.id, eventOrder.eventId))
		.where(
			and(
				eq(eventOrder.status, "confirmed"),
				gte(event.startAt, lookback),
				lte(event.startAt, horizon),
			),
		)
		.limit(limit);

	let remindersQueued = 0;
	let followUpsQueued = 0;

	for (const row of rows) {
		if (!row.contactEmail) continue;
		const settings = parseEventMessagingSettings(row.eventMetadata ?? {});
		const cadence =
			settings.reminderCadenceHours.length > 0
				? settings.reminderCadenceHours
				: [...DEFAULT_REMINDER_CADENCE_HOURS];
		const existing = await db
			.select({
				type: eventEmailDelivery.type,
				status: eventEmailDelivery.status,
				metadata: eventEmailDelivery.metadata,
			})
			.from(eventEmailDelivery)
			.where(
				and(
					eq(eventEmailDelivery.orderId, row.orderId),
					inArray(eventEmailDelivery.type, ["reminder", "follow_up"]),
				),
			);
		const existingReminders = new Map<
			number,
			(typeof eventEmailDelivery.status.enumValues)[number]
		>();
		let hasFollowUp = false;
		for (const record of existing) {
			if (record.type === "reminder") {
				const offset = reminderOffsetFromMetadata(
					record.metadata as Record<string, unknown>,
				);
				if (offset !== null) {
					existingReminders.set(offset, record.status);
				}
			}
			if (record.type === "follow_up" && record.status !== "failed") {
				hasFollowUp = true;
			}
		}
		const replyTo = resolveReplyToEmail(settings.replyToEmail ?? null, null);
		for (const offset of cadence) {
			const existingStatus = existingReminders.get(offset);
			if (existingStatus && existingStatus !== "failed") {
				continue;
			}
			const sendAt = new Date(
				row.eventStart.getTime() - offset * 60 * 60 * 1000,
			);
			await queueEmailDelivery({
				eventId: row.eventId,
				orderId: row.orderId,
				recipientEmail: row.contactEmail,
				recipientName: row.contactName ?? null,
				type: "reminder",
				scheduledAt: sendAt.getTime() < now.getTime() ? now : sendAt,
				replyTo,
				metadata: {
					offsetHours: offset,
					plannedSendAt: sendAt.toISOString(),
				},
			});
			remindersQueued += 1;
		}

		if (!hasFollowUp) {
			const followUpTarget = row.eventEnd ?? row.eventStart;
			const followUpSendAt = new Date(
				followUpTarget.getTime() + FOLLOW_UP_DELAY_HOURS * 60 * 60 * 1000,
			);
			await queueEmailDelivery({
				eventId: row.eventId,
				orderId: row.orderId,
				recipientEmail: row.contactEmail,
				recipientName: row.contactName ?? null,
				type: "follow_up",
				scheduledAt:
					followUpSendAt.getTime() < now.getTime() ? now : followUpSendAt,
				replyTo,
				metadata: {
					followUpHoursAfter: FOLLOW_UP_DELAY_HOURS,
				},
			});
			followUpsQueued += 1;
		}
	}

	return { remindersQueued, followUpsQueued } as const;
}
