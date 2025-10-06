import { protectedProcedure, publicProcedure, router } from "../lib/trpc";
import { adminDigestsRouter } from "./admin-digests";
import { adminFlagsRouter } from "./admin-flags";
import { adminLogsRouter } from "./admin-logs";
import { adminUsersRouter } from "./admin-users";
import { eventsRouter } from "./events";
import { orgsRouter } from "./orgs";
import { providersRouter } from "./providers";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	providers: providersRouter,
	events: eventsRouter,
	orgs: orgsRouter,
	adminUsers: adminUsersRouter,
	adminFlags: adminFlagsRouter,
	adminLogs: adminLogsRouter,
	adminDigests: adminDigestsRouter,
});
export type AppRouter = typeof appRouter;
