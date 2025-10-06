import { promoteWaitlistEntries } from "@/lib/events/registration";

export const runtime = "nodejs";

async function handleRequest(req: Request) {
	const cronSecret = process.env.CRON_SECRET;
	if (cronSecret) {
		const provided = req.headers.get("x-cron-secret");
		if (provided !== cronSecret) {
			return new Response("Unauthorized", { status: 401 });
		}
	}

	const url = new URL(req.url);
	const limitParam = url.searchParams.get("limit");
	const expiresParam = url.searchParams.get("expiresInHours");
	const limit = limitParam ? Number(limitParam) : undefined;
	const expiresInHours = expiresParam ? Number(expiresParam) : undefined;

	const promotions = await promoteWaitlistEntries({ limit, expiresInHours });

	return Response.json({
		promoted: promotions.length,
		entries: promotions,
	});
}

export async function GET(req: Request) {
	return handleRequest(req);
}

export async function POST(req: Request) {
	return handleRequest(req);
}
