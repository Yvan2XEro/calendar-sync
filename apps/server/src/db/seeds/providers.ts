import "dotenv/config";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { provider } from "../schema/app";

type ProviderSeed = typeof provider.$inferInsert;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not defined. Skipping provider seed.");
  process.exit(1);
}

const sql = postgres(connectionString /* , { ssl: "require" } */);

const db = drizzle(sql);

const baselineProviders: ProviderSeed[] = [
  {
    id: "1e66cd0e-9683-4caf-afcb-c7d55da5e6b9",
    category: "email",
    name: "Generic IMAP Email",
    description: "Connect any IMAP-compatible email inbox.",
    status: "active",
    config: {
      imap: {
        auth: {
          pass: "qG5va3Fn5rNPvTRy9t",
          user: "alfred.west87@ethereal.email",
        },
        host: "smtp.ethereal.email",
        port: 993,
        secure: true,
      },
      smtp: {
        auth: {
          pass: "qG5va3Fn5rNPvTRy9t",
          user: "alfred.west87@ethereal.email",
        },
        from: "alfred.west87@ethereal.email",
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
      },
      email: "alfred.west87@ethereal.email",
      displayName: "Alfred West",
    },
  },
  {
    id: "afa8902b-d05f-4171-b206-370d5234e13d",
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

await sql.end();

console.log(`Seeded ${baselineProviders.length} provider records.`);
