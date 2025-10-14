import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  admin,
  genericOAuth,
  openAPI,
  multiSession,
  organization,
} from "better-auth/plugins";

import { db } from "../db";
import * as schema from "../db/schema/auth";
import type { SessionLike } from "./session";
import { hydrateSessionWithTukiClaims } from "./tuki";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

const OIDC_PROVIDER_ID = requireEnv("NEXT_PUBLIC_OIDC_PROVIDER_ID");
const OIDC_CLIENT_ID = requireEnv("OIDC_CLIENT_ID");
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET; //requireEnv("OIDC_CLIENT_SECRET");
const OIDC_DISCOVERY_URL = requireEnv("OIDC_DISCOVERY_URL");

export const TUKI_OAUTH_PROVIDER_ID = OIDC_PROVIDER_ID;

export const auth = betterAuth<BetterAuthOptions>({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  trustedOrigins: (process.env.CORS_ORIGIN || "").split(","),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scope: ["https://www.googleapis.com/auth/calendar", "openid", "email"],
      prompt: "select_account consent",
      accessType: "offline",
      // disableDefaultScope
    },
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
    multiSession(),
    genericOAuth({
      config: [
        {
          providerId: TUKI_OAUTH_PROVIDER_ID,
          clientId: OIDC_CLIENT_ID,
          clientSecret: OIDC_CLIENT_SECRET,
          discoveryUrl: OIDC_DISCOVERY_URL,

          scopes: ["openid", "profile", "email"],
          pkce: true,

          getUserInfo: process.env.OIDC_USER_INFO_URL
            ? async (t) => {
                const response = await fetch(process.env.OIDC_USER_INFO_URL!, {
                  headers: {
                    Authorization: `Bearer ${t.accessToken}`,
                  },
                });
                const json = await response.json();
                return {
                  ...json,
                  emailVerified: true,
                };
              }
            : undefined,
        },
      ],
    }),
  ],
});

export async function enforceTukiSessionRoles(session: SessionLike) {
  return hydrateSessionWithTukiClaims(session);
}
