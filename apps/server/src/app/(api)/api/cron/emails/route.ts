import { scheduleDigestDeliveries } from "@/lib/mailer/digest";
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

	const digestFeatureEnabled = process.env.FEATURE_DIGEST_EMAILS === "true";
	const scheduled = await scheduleEventCommunications();
	const digest = digestFeatureEnabled ? await scheduleDigestDeliveries() : null;
	const processed = await processPendingEmailDeliveries();

	return Response.json({
		scheduled,
		digest,
		digestFeatureEnabled,
		processed,
	});
}

export async function GET(req: Request) {
	return handleRequest(req);
}

export async function POST(req: Request) {
	return handleRequest(req);
}
