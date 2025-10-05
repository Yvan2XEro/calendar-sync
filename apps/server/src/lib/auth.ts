import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  admin,
  organization,
  genericOAuth,
  openAPI,
} from "better-auth/plugins";
import { db } from "../db";
import * as schema from "../db/schema/auth";

export const auth = betterAuth<BetterAuthOptions>({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  trustedOrigins: (process.env.CORS_ORIGIN || "").split(","),
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  },
  plugins: [
    organization(),
    admin(),
    openAPI(),

    genericOAuth({
      config: [
        {
          providerId: process.env.OIDC_PROVIDER_ID!,
          clientId: process.env.OIDC_CLIENT_ID!,
          clientSecret: process.env.OIDC_CLIENT_SECRET,
          discoveryUrl: process.env.OIDC_DISCOVERY_URL,

          scopes: ["openid", "profile", "email"],
        },
      ],
    }),
  ],
});
