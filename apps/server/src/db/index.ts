import { drizzle } from "drizzle-orm/node-postgres";

import * as authSchema from "./schema/auth";
import * as appSchema from "./schema/app";

export const db = drizzle(process.env.DATABASE_URL || "", {
  schema: {
    ...authSchema,
    ...appSchema,
  },
});
