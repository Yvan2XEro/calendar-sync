import { randomUUID } from "node:crypto";

import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
	attendee,
	attendeeProfile,
	event,
	eventOrder,
	eventOrderItem,
	ticketType,
	waitlistEntry,
} from "@/db/schema/app";
import { queueOrderConfirmationEmail } from "@/lib/mailer/triggers";

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ACTIVE_ATTENDEE_STATUSES = [
	"reserved",
	"registered",
	"checked_in",
] as const;

export type ActiveAttendeeStatus = (typeof ACTIVE_ATTENDEE_STATUSES)[number];

export class RegistrationError extends Error {
	constructor(
		message: string,
		readonly code:
			| "event_not_found"
			| "ticket_not_found"
			| "ticket_not_on_sale"
			| "ticket_inactive"
			| "ticket_sold_out"
			| "capacity_exceeded"
			| "max_per_order_exceeded"
			| "invalid_quantity"
			| "profile_conflict",
	) {
		super(message);
		this.name = "RegistrationError";
	}
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function isTicketOnSale(
	record: typeof ticketType.$inferSelect,
	now = new Date(),
): boolean {
	if (record.status !== "active") return false;
	if (record.salesStartAt && now < record.salesStartAt) return false;
	if (record.salesEndAt && now > record.salesEndAt) return false;
	return true;
}

async function getActiveAttendeeCount(
	tx: TransactionClient,
	ticketTypeId: string,
): Promise<number> {
	const rows = await tx
		.select({ value: count() })
		.from(attendee)
		.where(
			and(
				eq(attendee.ticketTypeId, ticketTypeId),
				inArray(attendee.status, ACTIVE_ATTENDEE_STATUSES),
			),
		);
	const value = rows.at(0)?.value ?? 0;
	return typeof value === "number" ? value : Number(value);
}

function assertQuantity(quantity: number) {
	if (!Number.isInteger(quantity) || quantity <= 0) {
		throw new RegistrationError(
			"At least one attendee is required",
			"invalid_quantity",
		);
	}
}

async function assertTicketCapacity(
	tx: TransactionClient,
	ticket: typeof ticketType.$inferSelect,
	quantity: number,
) {
	assertQuantity(quantity);
	if (ticket.maxPerOrder && quantity > ticket.maxPerOrder) {
		throw new RegistrationError(
			`You can register up to ${ticket.maxPerOrder} attendee(s) for this ticket`,
			"max_per_order_exceeded",
		);
	}

	if (ticket.capacity === null || ticket.capacity === undefined) {
		return;
	}
	if (ticket.capacity <= 0) {
		throw new RegistrationError("This ticket is sold out", "ticket_sold_out");
	}
	const current = await getActiveAttendeeCount(tx, ticket.id);
	if (current >= ticket.capacity) {
		throw new RegistrationError("This ticket is sold out", "ticket_sold_out");
	}
	if (current + quantity > ticket.capacity) {
		throw new RegistrationError(
			"Not enough seats available",
			"capacity_exceeded",
		);
	}
}

type ProfileInput = {
	email: string;
	displayName?: string | null;
	phone?: string | null;
	organizationId?: string | null;
};

async function upsertAttendeeProfile(
	tx: TransactionClient,
	input: ProfileInput,
) {
	const email = normalizeEmail(input.email);
	const organizationCondition = input.organizationId
		? eq(attendeeProfile.organizationId, input.organizationId)
		: isNull(attendeeProfile.organizationId);
	const rows = await tx
		.select()
		.from(attendeeProfile)
		.where(and(eq(attendeeProfile.email, email), organizationCondition))
		.limit(1);

	const payload: typeof attendeeProfile.$inferInsert = {
		email,
		organizationId: input.organizationId ?? null,
		displayName: input.displayName ?? null,
		phone: input.phone ?? null,
	};

	if (rows.length > 0) {
		const existing = rows[0];
		const patch: Partial<typeof attendeeProfile.$inferInsert> = {};
		if (input.displayName && input.displayName !== existing.displayName) {
			patch.displayName = input.displayName;
		}
		if (input.phone && input.phone !== existing.phone) {
			patch.phone = input.phone;
		}
		if (Object.keys(patch).length > 0) {
			await tx
				.update(attendeeProfile)
				.set(patch)
				.where(eq(attendeeProfile.id, existing.id));
			return {
				...existing,
				...patch,
			} satisfies typeof attendeeProfile.$inferSelect;
		}
		return existing;
	}

	const [created] = await tx
		.insert(attendeeProfile)
		.values({ ...payload, id: randomUUID() })
		.returning();
	return created;
}

type RegistrationPersonInput = {
	email: string;
	name?: string | null;
	phone?: string | null;
	waitlistEntryId?: string | null;
	metadata?: Record<string, unknown>;
};

export type RegistrationDraftInput = {
	eventId: string;
	ticketTypeId: string;
	purchaser: RegistrationPersonInput;
	attendees: RegistrationPersonInput[];
	feeCents?: number;
	metadata?: Record<string, unknown>;
	orderItemMetadata?: Record<string, unknown>;
	paymentProvider?: string | null;
	paymentIntentId?: string | null;
	statusOverride?: (typeof eventOrder.status.enumValues)[number];
};

export type RegistrationDraftResult = {
	event: typeof event.$inferSelect;
	ticket: typeof ticketType.$inferSelect;
	order: typeof eventOrder.$inferSelect;
	orderItem: typeof eventOrderItem.$inferSelect;
	attendees: (typeof attendee.$inferSelect)[];
	remainingCapacity: number | null;
};

export async function createRegistrationDraft(
	input: RegistrationDraftInput,
): Promise<RegistrationDraftResult> {
	if (input.attendees.length === 0) {
		throw new RegistrationError(
			"At least one attendee must be provided",
			"invalid_quantity",
		);
	}

	return await db.transaction(async (tx) => {
		const eventRows = await tx
			.select()
			.from(event)
			.where(eq(event.id, input.eventId))
			.limit(1);
		const eventRecord = eventRows.at(0);
		if (!eventRecord) {
			throw new RegistrationError("Event not found", "event_not_found");
		}

		await tx.execute(
			sql`SELECT id FROM event_ticket_type WHERE id = ${input.ticketTypeId} FOR UPDATE`,
		);

		const ticketRows = await tx
			.select()
			.from(ticketType)
			.where(
				and(
					eq(ticketType.id, input.ticketTypeId),
					eq(ticketType.eventId, input.eventId),
				),
			)
			.limit(1);
		const ticketRecord = ticketRows.at(0);
		if (!ticketRecord) {
			throw new RegistrationError("Ticket not found", "ticket_not_found");
		}

		const now = new Date();
		if (!isTicketOnSale(ticketRecord, now)) {
			throw new RegistrationError(
				"Ticket sales are not currently available",
				"ticket_not_on_sale",
			);
		}

		await assertTicketCapacity(tx, ticketRecord, input.attendees.length);

		const purchaserProfile = await upsertAttendeeProfile(tx, {
			email: input.purchaser.email,
			displayName: input.purchaser.name ?? null,
			phone: input.purchaser.phone ?? null,
			organizationId: eventRecord.organizationId ?? null,
		});

		const attendeeProfiles = [] as (typeof attendeeProfile.$inferSelect)[];
		for (const attendeeInput of input.attendees) {
			const profile = await upsertAttendeeProfile(tx, {
				email: attendeeInput.email,
				displayName: attendeeInput.name ?? null,
				phone: attendeeInput.phone ?? null,
				organizationId: eventRecord.organizationId ?? null,
			});
			attendeeProfiles.push(profile);
		}

		const quantity = input.attendees.length;
		const subtotalCents = ticketRecord.priceCents * quantity;
		const feeCents = input.feeCents ?? 0;
		const totalCents = subtotalCents + feeCents;
		const paymentProvider =
			totalCents > 0 ? (input.paymentProvider ?? "stripe") : null;
		const status =
			input.statusOverride ??
			(totalCents > 0 ? "pending_payment" : "confirmed");
		const confirmationCode = randomUUID();

		const [orderRecord] = await tx
			.insert(eventOrder)
			.values({
				id: randomUUID(),
				eventId: eventRecord.id,
				organizationId: eventRecord.organizationId ?? null,
				purchaserProfileId: purchaserProfile.id,
				status,
				currency: ticketRecord.currency,
				quantity,
				subtotalCents,
				feeCents,
				totalCents,
				paymentProvider,
				paymentIntentId: input.paymentIntentId ?? null,
				contactEmail: purchaserProfile.email,
				contactName:
					input.purchaser.name ?? purchaserProfile.displayName ?? null,
				confirmationCode,
				metadata: input.metadata ?? {},
			})
			.returning();

		const [orderItemRecord] = await tx
			.insert(eventOrderItem)
			.values({
				id: randomUUID(),
				orderId: orderRecord.id,
				ticketTypeId: ticketRecord.id,
				quantity,
				unitAmountCents: ticketRecord.priceCents,
				subtotalCents,
				metadata: input.orderItemMetadata ?? {},
			})
			.returning();

		const attendeeStatus: ActiveAttendeeStatus =
			status === "confirmed" ? "registered" : "reserved";

		const attendeeRows = [] as (typeof attendee.$inferSelect)[];
		for (let index = 0; index < attendeeProfiles.length; index += 1) {
			const profile = attendeeProfiles[index];
			const attendeeInput = input.attendees[index];
			const [attendeeRecord] = await tx
				.insert(attendee)
				.values({
					id: randomUUID(),
					eventId: eventRecord.id,
					orderId: orderRecord.id,
					orderItemId: orderItemRecord.id,
					ticketTypeId: ticketRecord.id,
					profileId: profile.id,
					waitlistEntryId: attendeeInput.waitlistEntryId ?? null,
					status: attendeeStatus,
					confirmationCode: randomUUID(),
					metadata: attendeeInput.metadata ?? {},
				})
				.returning();
			attendeeRows.push(attendeeRecord);
		}

		let remainingCapacity: number | null = null;
		if (ticketRecord.capacity !== null && ticketRecord.capacity !== undefined) {
			const used = await getActiveAttendeeCount(tx, ticketRecord.id);
			remainingCapacity = Math.max(ticketRecord.capacity - used, 0);
		}

		return {
			event: eventRecord,
			ticket: ticketRecord,
			order: orderRecord,
			orderItem: orderItemRecord,
			attendees: attendeeRows,
			remainingCapacity,
		};
	});
}

export type TicketInventory = {
	ticket: typeof ticketType.$inferSelect;
	remaining: number | null;
	used: number;
	saleOpen: boolean;
	soldOut: boolean;
};

export async function getEventTicketInventory(
	eventId: string,
): Promise<TicketInventory[]> {
	return await db.transaction(async (tx) => {
		const tickets = await tx
			.select()
			.from(ticketType)
			.where(eq(ticketType.eventId, eventId))
			.orderBy(ticketType.priceCents, ticketType.createdAt);

		const now = new Date();
		const inventories: TicketInventory[] = [];
		for (const ticket of tickets) {
			const used = await getActiveAttendeeCount(tx, ticket.id);
			const remaining =
				ticket.capacity === null || ticket.capacity === undefined
					? null
					: Math.max(ticket.capacity - used, 0);
			const saleOpen = isTicketOnSale(ticket, now);
			const soldOut =
				ticket.capacity !== null &&
				ticket.capacity !== undefined &&
				remaining === 0;
			inventories.push({
				ticket,
				remaining,
				used,
				saleOpen,
				soldOut,
			});
		}
		return inventories;
	});
}

export async function updateOrderStatusAfterPayment({
	orderId,
	status,
	paymentIntentId,
	externalState,
}: {
	orderId: string;
	status: (typeof eventOrder.status.enumValues)[number];
	paymentIntentId?: string | null;
	externalState?: string | null;
}) {
	const updates: Partial<typeof eventOrder.$inferInsert> = { status };
	if (paymentIntentId !== undefined) {
		updates.paymentIntentId = paymentIntentId;
	}
	if (externalState !== undefined) {
		updates.externalPaymentState = externalState;
	}

	const [orderRecord] = await db
		.update(eventOrder)
		.set(updates)
		.where(eq(eventOrder.id, orderId))
		.returning();

	if (!orderRecord) return null;

	if (status === "confirmed") {
		await db
			.update(attendee)
			.set({ status: "registered" })
			.where(eq(attendee.orderId, orderId));
		await queueOrderConfirmationEmail(orderId);
	}

	if (status === "cancelled" || status === "refunded") {
		await db
			.update(attendee)
			.set({ status: "cancelled" })
			.where(eq(attendee.orderId, orderId));
	}

	return orderRecord;
}

export async function markWaitlistEntryAsConverted(
	id: string,
	orderId: string,
) {
	await db
		.update(waitlistEntry)
		.set({
			status: "converted",
			promotedOrderId: orderId,
		})
		.where(eq(waitlistEntry.id, id));
}

export async function releaseWaitlistEntry(id: string) {
	await db
		.update(waitlistEntry)
		.set({ status: "removed" })
		.where(eq(waitlistEntry.id, id));
}

export type WaitlistPromotionOptions = {
	limit?: number;
	expiresInHours?: number;
};

export async function promoteWaitlistEntries({
	limit = 20,
	expiresInHours = 24,
}: WaitlistPromotionOptions = {}) {
	return await db.transaction(async (tx) => {
		const candidates = await tx
			.select()
			.from(waitlistEntry)
			.where(eq(waitlistEntry.status, "active"))
			.orderBy(waitlistEntry.createdAt)
			.limit(limit * 2);

		const promotions: Array<{
			id: string;
			eventId: string;
			ticketTypeId: string | null;
			promotionExpiresAt: Date | null;
		}> = [];

		for (const entry of candidates) {
			if (promotions.length >= limit) break;
			if (!entry.ticketTypeId) {
				continue;
			}

			await tx.execute(
				sql`SELECT id FROM event_ticket_type WHERE id = ${entry.ticketTypeId} FOR UPDATE`,
			);

			const ticketRows = await tx
				.select()
				.from(ticketType)
				.where(eq(ticketType.id, entry.ticketTypeId))
				.limit(1);
			const ticket = ticketRows.at(0);
			if (!ticket) continue;

			let remaining: number | null = null;
			if (ticket.capacity === null || ticket.capacity === undefined) {
				remaining = null;
			} else {
				const used = await getActiveAttendeeCount(tx, ticket.id);
				const alreadyPromoted = promotions.filter(
					(promotion) => promotion.ticketTypeId === ticket.id,
				).length;
				remaining = ticket.capacity - used - alreadyPromoted;
			}

			if (remaining !== null && remaining <= 0) {
				continue;
			}

			const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
			const [updatedEntry] = await tx
				.update(waitlistEntry)
				.set({
					status: "invited",
					promotionExpiresAt: expiresAt,
				})
				.where(eq(waitlistEntry.id, entry.id))
				.returning();

			if (updatedEntry) {
				promotions.push({
					id: updatedEntry.id,
					eventId: updatedEntry.eventId,
					ticketTypeId: updatedEntry.ticketTypeId,
					promotionExpiresAt: updatedEntry.promotionExpiresAt,
				});
			}
		}

		return promotions;
	});
}

export type WaitlistEnqueueInput = {
	eventId: string;
	ticketTypeId?: string | null;
	person: RegistrationPersonInput;
	metadata?: Record<string, unknown>;
};

export async function enqueueWaitlist(
	input: WaitlistEnqueueInput,
): Promise<typeof waitlistEntry.$inferSelect> {
	return await db.transaction(async (tx) => {
		const eventRows = await tx
			.select({ id: event.id, organizationId: event.organizationId })
			.from(event)
			.where(eq(event.id, input.eventId))
			.limit(1);
		const targetEvent = eventRows.at(0);
		if (!targetEvent) {
			throw new RegistrationError("Event not found", "event_not_found");
		}

		if (input.ticketTypeId) {
			const ticketRows = await tx
				.select({ id: ticketType.id })
				.from(ticketType)
				.where(
					and(
						eq(ticketType.id, input.ticketTypeId),
						eq(ticketType.eventId, input.eventId),
					),
				)
				.limit(1);
			if (!ticketRows.length) {
				throw new RegistrationError("Ticket not found", "ticket_not_found");
			}
		}

		const profile = await upsertAttendeeProfile(tx, {
			email: input.person.email,
			displayName: input.person.name ?? null,
			phone: input.person.phone ?? null,
			organizationId: targetEvent.organizationId ?? null,
		});

		const [{ value: maxPositionRaw }] = await tx
			.select({ value: sql<number>`coalesce(max(position), 0)` })
			.from(waitlistEntry)
			.where(
				and(
					eq(waitlistEntry.eventId, input.eventId),
					input.ticketTypeId
						? eq(waitlistEntry.ticketTypeId, input.ticketTypeId)
						: isNull(waitlistEntry.ticketTypeId),
				),
			);
		const maxPosition =
			typeof maxPositionRaw === "number"
				? maxPositionRaw
				: Number(maxPositionRaw);

		const [entry] = await tx
			.insert(waitlistEntry)
			.values({
				id: randomUUID(),
				eventId: input.eventId,
				ticketTypeId: input.ticketTypeId ?? null,
				profileId: profile.id,
				status: "active",
				position: maxPosition + 1,
				metadata: input.metadata ?? {},
			})
			.returning();
		return entry;
	});
}
