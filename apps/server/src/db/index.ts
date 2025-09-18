import { drizzle } from "drizzle-orm/node-postgres";

import * as authSchema from "./schema/auth";
import * as providerSchema from "./schema/providers";

export const db = drizzle(process.env.DATABASE_URL || "", {
        schema: {
                ...authSchema,
                ...providerSchema,
        },
});
