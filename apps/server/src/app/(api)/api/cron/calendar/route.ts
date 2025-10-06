import { processPendingCalendarSyncJobs } from "@/lib/events/calendar-sync";

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
		const summary = await processPendingCalendarSyncJobs();
		return Response.json({ summary });
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
