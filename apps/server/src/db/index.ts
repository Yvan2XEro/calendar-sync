import { drizzle } from "drizzle-orm/node-postgres";
import * as appSchema from "./schema/app";
import * as authSchema from "./schema/auth";

export const db = drizzle(process.env.DATABASE_URL || "", {
	schema: {
		...authSchema,
		...appSchema,
	},
});
