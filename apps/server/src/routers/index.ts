import { protectedProcedure, publicProcedure, router } from "../lib/trpc";
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
});
export type AppRouter = typeof appRouter;
