import { ZodError } from "zod";

import { syncGoogleCalendars } from "@/lib/cron/google-calendar-sync";

export const runtime = "nodejs";

function parseQueryNumber(value: string | null): number | undefined | null {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

async function handleRequest(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (cronSecret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const url = new URL(req.url);
    const limitValue = parseQueryNumber(url.searchParams.get("limit"));
    const lookaheadValue = parseQueryNumber(
      url.searchParams.get("lookaheadHours")
    );

    if (limitValue === null || lookaheadValue === null) {
      return Response.json(
        { error: "Invalid numeric query parameter" },
        { status: 400 }
      );
    }

    const options: {
      limit?: number;
      lookaheadHours?: number;
    } = {};

    if (limitValue !== undefined) {
      options.limit = limitValue;
    }

    if (lookaheadValue !== undefined) {
      options.lookaheadHours = lookaheadValue;
    }

    const result = await syncGoogleCalendars(options);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "Invalid query parameter value", details: error.issues },
        { status: 400 }
      );
    }

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
