import { desc, sql } from "drizzle-orm";
import {
	bigserial,
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

const timestamps = {
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => sql`now()`),
};
export const providerStatus = pgEnum("provider_status", [
	"draft",
	"beta",
	"active",
	"deprecated",
]);

export const eventStatus = pgEnum("event_status", [
	"pending",
	"approved",
	"rejected",
]);

export const ticketTypeStatus = pgEnum("event_ticket_type_status", [
	"draft",
	"active",
	"archived",
]);

export const eventOrderStatus = pgEnum("event_order_status", [
	"pending_payment",
	"requires_action",
	"confirmed",
	"cancelled",
	"refunded",
]);

export const attendeeStatus = pgEnum("event_attendee_status", [
	"reserved",
	"registered",
	"checked_in",
	"cancelled",
	"waitlisted",
]);

export const waitlistStatus = pgEnum("event_waitlist_status", [
	"active",
	"invited",
	"converted",
	"removed",
]);

export const eventEmailType = pgEnum("event_email_type", [
	"confirmation",
	"reminder",
	"update",
	"cancellation",
	"follow_up",
	"announcement",
]);

export const eventEmailStatus = pgEnum("event_email_status", [
	"pending",
	"sending",
	"sent",
	"failed",
]);

export const eventAutomationType = pgEnum("event_automation_type", [
	"calendar_sync",
	"digest_refresh",
]);

export const eventAutomationStatus = pgEnum("event_automation_status", [
	"pending",
	"processing",
	"completed",
	"failed",
]);

export const provider = pgTable("provider", {
	id: text("id").primaryKey(),
	category: text("category").notNull(),
	name: text("name").notNull(),
	description: text("description"),
	config: jsonb("config")
		.$type<Record<string, unknown>>()
		.notNull()
		.default(sql`'{}'::jsonb`),
	status: providerStatus("status").notNull().default("draft"),
	trusted: boolean("trusted").notNull().default(false),
	lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
	...timestamps,
});

export const organizationProvider = pgTable(
	"organization_provider",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		providerId: text("provider_id")
			.notNull()
			.references(() => provider.id, { onDelete: "cascade" }),
	},
	(table) => ({
		organizationProviderUnique: uniqueIndex(
			"organization_provider_organization_id_provider_id_unique",
		).on(table.organizationId, table.providerId),
	}),
);

export const flag = pgTable(
	"flag",
	{
		id: text("id").primaryKey(),
		label: text("label").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		priority: integer("priority").notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex("flag_slug_unique").on(table.slug),
		check(
			"flag_priority_range",
			sql`${table.priority} >= 1 AND ${table.priority} <= 5`,
		),
	],
);

export const event = pgTable(
	"event",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull(),
		provider: text("provider_id")
			.notNull()
			.references(() => provider.id, { onDelete: "set null" }),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		flag: text("flag_id").references(() => flag.id, { onDelete: "set null" }),
		title: text("title").notNull(),
		description: text("description"),
		location: text("location"),
		url: text("url"),
		heroMedia: jsonb("hero_media")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		landingPage: jsonb("landing_page")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		startAt: timestamp("start_at", { withTimezone: true }).notNull(),
		endAt: timestamp("end_at", { withTimezone: true }),
		isAllDay: boolean("is_all_day").default(false).notNull(),
		isPublished: boolean("is_published").default(false).notNull(),
		externalId: text("external_id"),
		googleCalendarEventId: text("google_calendar_event_id"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.default(sql`'{}'::jsonb`)
			.notNull(),

		status: eventStatus("status").notNull().default("pending"),

		priority: integer("priority").notNull().default(3),

		...timestamps,
	},
	(table) => ({
		eventSlugUnique: uniqueIndex("event_slug_unique").on(table.slug),
		eventProviderExternalIdUnique: uniqueIndex(
			"event_provider_id_external_id_unique",
		).on(table.provider, table.externalId),
		statusStartAtIdx: index("status_start_at_idx").on(
			table.status,
			desc(table.startAt),
		),
		statusCreatedAtIdx: index("status_created_at_idx").on(
			table.status,
			desc(table.createdAt),
		),
		providerStartAtIdx: index("provider_start_at_idx").on(
			table.provider,
			desc(table.startAt),
		),
		providerCreatedAtIdx: index("provider_created_at_idx").on(
			table.provider,
			desc(table.createdAt),
		),
		providerStatusStartAtIdx: index("provider_status_start_at_idx").on(
			table.provider,
			table.status,
			desc(table.startAt),
		),
		providerStatusCreatedAtIdx: index("provider_status_created_at_idx").on(
			table.provider,
			table.status,
			desc(table.createdAt),
		),
		organizationIdx: index("event_organization_idx").on(table.organizationId),
	}),
);

export const eventAutomationJob = pgTable(
	"event_automation_job",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		type: eventAutomationType("type").notNull(),
		status: eventAutomationStatus("status").notNull().default("pending"),
		payload: jsonb("payload")
			.$type<Record<string, unknown>>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		scheduledAt: timestamp("scheduled_at", { withTimezone: true })
			.default(sql`now()`)
			.notNull(),
		...timestamps,
	},
	(table) => ({
		eventAutomationJobPendingUnique: uniqueIndex(
			"event_automation_job_event_id_type_status_unique",
		).on(table.eventId, table.type, table.status),
		eventAutomationJobEventIdx: index("event_automation_job_event_idx").on(
			table.eventId,
			table.createdAt,
		),
	}),
);

export type Provider = typeof provider.$inferSelect;
export type Event = typeof event.$inferSelect;

export const attendeeProfile = pgTable(
	"event_attendee_profile",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "cascade",
		}),
		email: text("email").notNull(),
		displayName: text("display_name"),
		phone: text("phone"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		...timestamps,
	},
	(table) => [
		uniqueIndex("event_attendee_profile_organization_id_email_unique").on(
			table.organizationId,
			table.email,
		),
		index("event_attendee_profile_email_idx").on(table.email),
	],
);

export const ticketType = pgTable(
	"event_ticket_type",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		priceCents: integer("price_cents").notNull().default(0),
		currency: text("currency").notNull().default("usd"),
		capacity: integer("capacity"),
		maxPerOrder: integer("max_per_order"),
		salesStartAt: timestamp("sales_start_at", { withTimezone: true }),
		salesEndAt: timestamp("sales_end_at", { withTimezone: true }),
		status: ticketTypeStatus("status").notNull().default("active"),
		isWaitlistEnabled: boolean("is_waitlist_enabled").notNull().default(true),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		...timestamps,
	},
	(table) => [
		index("event_ticket_type_event_id_status_idx").on(
			table.eventId,
			table.status,
		),
	],
);

export const eventOrder = pgTable(
	"event_order",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		purchaserProfileId: text("purchaser_profile_id").references(
			() => attendeeProfile.id,
			{ onDelete: "set null" },
		),
		status: eventOrderStatus("status").notNull().default("pending_payment"),
		currency: text("currency").notNull().default("usd"),
		quantity: integer("quantity").notNull().default(1),
		subtotalCents: integer("subtotal_cents").notNull().default(0),
		feeCents: integer("fee_cents").notNull().default(0),
		totalCents: integer("total_cents").notNull().default(0),
		paymentProvider: text("payment_provider"),
		paymentIntentId: text("payment_intent_id"),
		externalPaymentState: text("external_payment_state"),
		contactEmail: text("contact_email").notNull(),
		contactName: text("contact_name"),
		confirmationCode: text("confirmation_code"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		...timestamps,
	},
	(table) => [
		uniqueIndex("event_order_confirmation_code_unique").on(
			table.confirmationCode,
		),
		index("event_order_event_id_status_idx").on(table.eventId, table.status),
		index("event_order_payment_intent_idx").on(table.paymentIntentId),
		index("event_order_created_at_idx").on(table.createdAt),
	],
);

export const eventOrderItem = pgTable(
	"event_order_item",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => eventOrder.id, { onDelete: "cascade" }),
		ticketTypeId: text("ticket_type_id")
			.notNull()
			.references(() => ticketType.id, { onDelete: "restrict" }),
		quantity: integer("quantity").notNull().default(1),
		unitAmountCents: integer("unit_amount_cents").notNull().default(0),
		subtotalCents: integer("subtotal_cents").notNull().default(0),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		...timestamps,
	},
	(table) => [
		uniqueIndex("event_order_item_order_id_ticket_type_id_unique").on(
			table.orderId,
			table.ticketTypeId,
		),
	],
);

export const waitlistEntry = pgTable(
	"event_waitlist_entry",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		ticketTypeId: text("ticket_type_id").references(() => ticketType.id, {
			onDelete: "set null",
		}),
		profileId: text("profile_id")
			.notNull()
			.references(() => attendeeProfile.id, { onDelete: "cascade" }),
		status: waitlistStatus("status").notNull().default("active"),
		position: integer("position"),
		promotedOrderId: text("promoted_order_id").references(() => eventOrder.id, {
			onDelete: "set null",
		}),
		promotionExpiresAt: timestamp("promotion_expires_at", {
			withTimezone: true,
		}),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		...timestamps,
	},
	(table) => [
		uniqueIndex("event_waitlist_event_id_ticket_type_id_profile_id_unique").on(
			table.eventId,
			table.ticketTypeId,
			table.profileId,
		),
		index("event_waitlist_status_idx").on(table.status),
	],
);

export const attendee = pgTable(
	"event_attendee",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		orderId: text("order_id").references(() => eventOrder.id, {
			onDelete: "set null",
		}),
		orderItemId: text("order_item_id").references(() => eventOrderItem.id, {
			onDelete: "set null",
		}),
		ticketTypeId: text("ticket_type_id").references(() => ticketType.id, {
			onDelete: "set null",
		}),
		profileId: text("profile_id").references(() => attendeeProfile.id, {
			onDelete: "set null",
		}),
		waitlistEntryId: text("waitlist_entry_id").references(
			() => waitlistEntry.id,
			{
				onDelete: "set null",
			},
		),
		status: attendeeStatus("status").notNull().default("reserved"),
		confirmationCode: text("confirmation_code").notNull(),
		checkInAt: timestamp("check_in_at", { withTimezone: true }),
		noShow: boolean("no_show").notNull().default(false),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		...timestamps,
	},
	(table) => [
		uniqueIndex("event_attendee_confirmation_code_unique").on(
			table.confirmationCode,
		),
		index("event_attendee_event_id_status_idx").on(table.eventId, table.status),
	],
);

export const eventEmailDelivery = pgTable(
	"event_email_delivery",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		orderId: text("order_id").references(() => eventOrder.id, {
			onDelete: "set null",
		}),
		attendeeId: text("attendee_id").references(() => attendee.id, {
			onDelete: "set null",
		}),
		recipientEmail: text("recipient_email").notNull(),
		recipientName: text("recipient_name"),
		type: eventEmailType("type").notNull(),
		status: eventEmailStatus("status").notNull().default("pending"),
		subject: text("subject"),
		replyTo: text("reply_to"),
		providerMessageId: text("provider_message_id"),
		lastError: text("last_error"),
		attemptCount: integer("attempt_count").notNull().default(0),
		scheduledAt: timestamp("scheduled_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		...timestamps,
	},
	(table) => [
		index("event_email_delivery_status_scheduled_idx").on(
			table.status,
			table.scheduledAt,
		),
		index("event_email_delivery_event_type_recipient_idx").on(
			table.eventId,
			table.type,
			table.recipientEmail,
		),
	],
);

export type AttendeeProfile = typeof attendeeProfile.$inferSelect;
export type TicketType = typeof ticketType.$inferSelect;
export type EventOrder = typeof eventOrder.$inferSelect;
export type EventOrderItem = typeof eventOrderItem.$inferSelect;
export type WaitlistEntry = typeof waitlistEntry.$inferSelect;
export type Attendee = typeof attendee.$inferSelect;
export type EventEmailDelivery = typeof eventEmailDelivery.$inferSelect;
export type InsertEventEmailDelivery = typeof eventEmailDelivery.$inferInsert;

export const workerLog = pgTable("worker_log", {
	id: bigserial("id", { mode: "number" }).primaryKey(),
	ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
	level: text("level").notNull(),
	providerId: text("provider_id"),
	sessionId: text("session_id"),
	msg: text("msg").notNull(),
	data: jsonb("data").$type<Record<string, unknown> | null>(),
});

export type WorkerLog = typeof workerLog.$inferSelect;
