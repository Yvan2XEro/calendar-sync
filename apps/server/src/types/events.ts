import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type UpcomingEvent = RouterOutputs["events"]["listRecentForUser"][number];
