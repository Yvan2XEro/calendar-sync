import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	admin,
	genericOAuth,
	openAPI,
	organization,
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
					providerId: process.env.NEXT_PUBLIC_OIDC_PROVIDER_ID!,
					clientId: process.env.OIDC_CLIENT_ID!,
					clientSecret: process.env.OIDC_CLIENT_SECRET,
					discoveryUrl: process.env.OIDC_DISCOVERY_URL,

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
