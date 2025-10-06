import { drizzle } from "drizzle-orm/postgres-js";
import * as appSchema from "./schema/app";
import * as authSchema from "./schema/auth";

export const db = drizzle(process.env.DATABASE_URL || "", {
	schema: {
		...authSchema,
		...appSchema,
	},
});
