import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { event } from "@/db/schema/app";
import { organization } from "@/db/schema/auth";
import { buildICS } from "@/lib/calendar-links";

export const runtime = "nodejs";

function escapeText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

function extractEventLines(document: string): string[] {
	const lines = document.split(/\r?\n/);
	const start = lines.indexOf("BEGIN:VEVENT");
	const end = lines.indexOf("END:VEVENT");
	if (start === -1 || end === -1 || end <= start) {
		return [];
	}
	return lines.slice(start, end + 1);
}

function buildCalendarFeed(
	name: string,
	events: Array<{
		id: string;
		title: string;
		description: string | null;
		location: string | null;
		url: string | null;
		startAt: Date;
		endAt: Date | null;
		metadata: Record<string, unknown> | null;
	}>,
): string {
	const calendarLines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//CalendarSync//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		`X-WR-CALNAME:${escapeText(name)}`,
	];

	for (const event of events) {
		const ics = buildICS({
			id: event.id,
			title: event.title,
			startAt: event.startAt,
			endAt: event.endAt ?? undefined,
			description: event.description ?? undefined,
			location: event.location ?? undefined,
			url: event.url ?? undefined,
			metadata: event.metadata ?? undefined,
		});

		const eventLines = extractEventLines(ics);
		if (eventLines.length > 0) {
			calendarLines.push(...eventLines);
		}
	}

	calendarLines.push("END:VCALENDAR");
	return calendarLines.join("\r\n");
}

function resolveSlug(raw: string | string[] | undefined): string | null {
	if (!raw) return null;
	const first = Array.isArray(raw) ? raw.at(0) : raw;
	const normalized = first?.trim();
	return normalized && normalized.length > 0 ? normalized : null;
}

export async function GET(_req: NextRequest, context: any): Promise<Response> {
	const params = context.params ? await context.params : undefined;
	const slug = resolveSlug(params?.org);
	if (!slug || slug.trim().length === 0) {
		return new Response("Not found", { status: 404 });
	}

	const organizations = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
		})
		.from(organization)
		.where(eq(organization.slug, slug))
		.limit(1);

	const org = organizations.at(0);
	if (!org) {
		return new Response("Not found", { status: 404 });
	}

	const rows = await db
		.select({
			id: event.id,
			title: event.title,
			description: event.description,
			location: event.location,
			url: event.url,
			startAt: event.startAt,
			endAt: event.endAt,
			metadata: event.metadata,
		})
		.from(event)
		.where(
			and(
				eq(event.organizationId, org.id),
				eq(event.status, "approved"),
				eq(event.isPublished, true),
			),
		)
		.orderBy(event.startAt, event.id);

	const calendarName = org.name?.trim().length ? org.name : org.slug;
	const payload = buildCalendarFeed(calendarName, rows);
	const safeSlug = org.slug.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-");
	const fileName = `${safeSlug || "calendar"}.ics`;

	return new Response(payload, {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Cache-Control": "public, max-age=900",
			"Content-Disposition": `inline; filename="${fileName}"`,
		},
	});
}
