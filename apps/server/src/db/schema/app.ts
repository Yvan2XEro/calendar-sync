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

    status: eventStatus("status").notNull().default("pending"),

    priority: integer("priority").notNull().default(3),

    ...timestamps,
  },
  (table) => ({
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
