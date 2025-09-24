import { sql } from "drizzle-orm";
import {
	bigserial,
	boolean,
	check,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

export const providerStatus = pgEnum("provider_status", [
	"draft",
	"beta",
	"active",
	"deprecated",
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
	lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
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
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => sql`now()`),
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
		provider: text("provider_id")
			.notNull()
			.references(() => provider.id, { onDelete: "set null" }),
		flag: text("flag_id").references(() => flag.id, { onDelete: "set null" }),
		title: text("title").notNull(),
		description: text("description"),
		location: text("location"),
		url: text("url"),
		startAt: timestamp("start_at", { withTimezone: true }).notNull(),
		endAt: timestamp("end_at", { withTimezone: true }),
		isAllDay: boolean("is_all_day").default(false).notNull(),
		isPublished: boolean("is_published").default(false).notNull(),
		externalId: text("external_id"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.default(sql`'{}'::jsonb`)
			.notNull(),

		priority: integer("priority").notNull().default(3),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => ({
		eventProviderExternalIdUnique: uniqueIndex(
			"event_provider_id_external_id_unique",
		).on(table.provider, table.externalId),
	}),
);

export type Provider = typeof provider.$inferSelect;
export type Event = typeof event.$inferSelect;

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
