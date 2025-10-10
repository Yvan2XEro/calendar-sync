import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import type { AppRouter } from "@/routers";

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			toast.error(error.message, {
				action: {
					label: "retry",
					onClick: () => {
						queryClient.invalidateQueries();
					},
				},
			});
		},
	}),
});

export const trpcClient = createTRPCClient<AppRouter>({
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

export const trpc = createTRPCOptionsProxy<AppRouter>({
	client: trpcClient,
	queryClient,
});

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

type ListForUserInput = RouterInputs["orgs"]["listForUser"];
type ListForUserOutput = RouterOutputs["orgs"]["listForUser"];
type GetForUserInput = RouterInputs["orgs"]["getForUser"];
type GetForUserOutput = RouterOutputs["orgs"]["getForUser"];

export const eventsApi = {
	listRecentForUser: (input?: RouterInputs["events"]["listRecentForUser"]) =>
		trpcClient.events.listRecentForUser.query(input),
};

export const googleCalendarApi = {
	listUpcomingEvents: (
		input?: RouterInputs["googleCalendar"]["listUpcomingEvents"],
	) => trpcClient.googleCalendar.listUpcomingEvents.query(input),
};

export const orgsApi = {
        listForUser: async <TSegment extends ListForUserInput["segment"]>(
                input: ListForUserInput & { segment: TSegment },
        ) =>
                (await trpcClient.orgs.listForUser.query(input)) as Extract<
                        ListForUserOutput,
                        { segment: TSegment }
                >,
        join: (input: RouterInputs["orgs"]["join"]) =>
                trpcClient.orgs.join.mutate(input),
        getForUser: (input: GetForUserInput) =>
                trpcClient.orgs.getForUser.query(input) as Promise<GetForUserOutput>,
};
