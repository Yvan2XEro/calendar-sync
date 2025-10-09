import { createContext } from "@/lib/context";
import { appRouter } from "@/routers";

export const runtime = "nodejs";

async function handleRequest(req: Request) {
	const cronSecret = process.env.CRON_SECRET;
	if (cronSecret) {
		const provided = req.headers.get("x-cron-secret");
		if (provided !== cronSecret) {
			return new Response("Unauthorized", { status: 401 });
		}
	}

        try {
                const ctx = await createContext(req);
                const caller = appRouter.createCaller(ctx);

                const url = new URL(req.url);
                const limitParam = url.searchParams.get("limit");
                const lookaheadParam = url.searchParams.get("lookaheadHours");

                let limit = limitParam ? Number(limitParam) : undefined;
                if (limit !== undefined && !Number.isFinite(limit)) {
                        limit = undefined;
                }

                let lookaheadHours = lookaheadParam ? Number(lookaheadParam) : undefined;
                if (lookaheadHours !== undefined && !Number.isFinite(lookaheadHours)) {
                        lookaheadHours = undefined;
                }

                const input =
                        limit === undefined && lookaheadHours === undefined
                                ? undefined
                                : { limit, lookaheadHours };

                const result = await caller.cron.syncGoogleCalendars(input);
                return Response.json(result);
        } catch (error) {
                const message =
                        error instanceof Error ? error.message : "Calendar sync failed";
		return Response.json({ error: message }, { status: 500 });
	}
}

export async function GET(req: Request) {
	return handleRequest(req);
}

export async function POST(req: Request) {
	return handleRequest(req);
}
