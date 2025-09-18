import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const providers = pgTable("provider", {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        description: text("description"),
        createdAt: timestamp("created_at", { withTimezone: true })
                .notNull()
                .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
                .notNull()
                .defaultNow(),
});

export const organizationProviderLinks = pgTable(
        "organization_provider_link",
        {
                organizationId: text("organization_id")
                        .notNull()
                        .references(() => organization.id, { onDelete: "cascade" }),
                providerId: text("provider_id")
                        .notNull()
                        .references(() => providers.id, { onDelete: "cascade" }),
                linkedById: text("linked_by_id")
                        .notNull()
                        .references(() => user.id, { onDelete: "cascade" }),
                createdAt: timestamp("created_at", { withTimezone: true })
                        .notNull()
                        .defaultNow(),
                updatedAt: timestamp("updated_at", { withTimezone: true })
                        .notNull()
                        .defaultNow(),
        },
        (table) => ({
                pk: primaryKey({ columns: [table.organizationId, table.providerId] }),
        }),
);
