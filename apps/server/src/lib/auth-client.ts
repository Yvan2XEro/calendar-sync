import {
	adminClient,
	inferOrgAdditionalFields,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
type AuthInstance = typeof import("./auth").auth;

export const authClient = createAuthClient({
	plugins: [
		organizationClient({
			schema: inferOrgAdditionalFields<AuthInstance>(),
		}),
		adminClient(),
	],
});
