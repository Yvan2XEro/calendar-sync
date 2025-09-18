import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { organization } from "./auth";

export const provider = pgTable("provider", {
	id: text("id").primaryKey(),
	category: text("category").notNull(),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
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
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => ({
		organizationProviderUnique: uniqueIndex(
			"organization_provider_organization_id_provider_id_unique",
		).on(table.organizationId, table.providerId),
	}),
);
