import {
	processPendingEmailDeliveries,
	scheduleEventCommunications,
} from "@/lib/mailer/scheduler";

export const runtime = "nodejs";

async function handleRequest(req: Request) {
	const cronSecret = process.env.CRON_SECRET;
	if (cronSecret) {
		const provided = req.headers.get("x-cron-secret");
		if (provided !== cronSecret) {
			return new Response("Unauthorized", { status: 401 });
		}
	}

	const scheduled = await scheduleEventCommunications();
	const processed = await processPendingEmailDeliveries();

	return Response.json({
		scheduled,
		processed,
	});
}

export async function GET(req: Request) {
	return handleRequest(req);
}

export async function POST(req: Request) {
	return handleRequest(req);
}
