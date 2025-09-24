import { protectedProcedure, publicProcedure, router } from "../lib/trpc";
import { adminFlagsRouter } from "./admin-flags";
import { adminLogsRouter } from "./admin-logs";
import { adminUsersRouter } from "./admin-users";
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
	adminUsers: adminUsersRouter,
	adminFlags: adminFlagsRouter,
	adminLogs: adminLogsRouter,
});
export type AppRouter = typeof appRouter;
