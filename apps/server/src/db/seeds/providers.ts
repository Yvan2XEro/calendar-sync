import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { provider } from "../schema/app";

type ProviderSeed = typeof provider.$inferInsert;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	console.error("DATABASE_URL is not defined. Skipping provider seed.");
	process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool);

const baselineProviders: ProviderSeed[] = [
	{
		id: "email.imap",
		category: "email",
		name: "Generic IMAP Email",
		description: "Connect any IMAP-compatible email inbox.",
		status: "active",
	},
	{
		id: "google.gmail",
		category: "google",
		name: "Google Gmail",
		description: "Connect a Gmail account managed by Google.",
		status: "beta",
	},
];

await db
	.insert(provider)
	.values(baselineProviders)
	.onConflictDoNothing({ target: provider.id });

await pool.end();

console.log(`Seeded ${baselineProviders.length} provider records.`);
