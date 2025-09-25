import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/routers";

export type EventsListOutput = inferRouterOutputs<AppRouter>["events"]["list"];
export type EventListItem = EventsListOutput["items"][number];
