import { sql } from "drizzle-orm";
import {
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
