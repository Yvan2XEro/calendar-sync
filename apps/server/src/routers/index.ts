import { protectedProcedure, publicProcedure, router } from "../lib/trpc";
import { adminCalendarConnectionsRouter } from "./admin-calendar-connections";
import { adminDigestsRouter } from "./admin-digests";
import { adminFlagsRouter } from "./admin-flags";
import { adminLogsRouter } from "./admin-logs";
import { adminTicketTypesRouter } from "./admin-ticket-types";
import { adminUsersRouter } from "./admin-users";
import { calendarConnectionsRouter } from "./calendar-connections";
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
        adminTicketTypes: adminTicketTypesRouter,
        calendarConnections: calendarConnectionsRouter,
        adminCalendarConnections: adminCalendarConnectionsRouter,
});
export type AppRouter = typeof appRouter;
