// @ts-nocheck
import { createTRPCClient, httpBatchLink } from "@trpc/client";

export const trpcClient = createTRPCClient<any>({
	links: [
		httpBatchLink({
			url: "/trpc",
			fetch(url, options) {
				return fetch(url, {
					...options,
					credentials: "include",
				});
			},
		}),
	],
});
