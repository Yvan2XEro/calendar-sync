import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
			cause: "No session",
		});
	}
	return next({
		ctx: {
			...ctx,
			session: ctx.session,
		},
	});
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
	const userRole = (
		ctx.session.user as typeof ctx.session.user & {
			role?: string | null;
		}
	)?.role;
	const roles = userRole ? [userRole] : [];

	if (!roles.includes("admin")) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Administrator permissions are required",
		});
	}

	return next();
});
