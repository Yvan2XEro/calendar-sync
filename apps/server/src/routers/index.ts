import { protectedProcedure, publicProcedure, router } from "../lib/trpc";
import { providers } from "./providers";

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
        providers,
});
export type AppRouter = typeof appRouter;
