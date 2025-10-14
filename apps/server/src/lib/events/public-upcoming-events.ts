import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { event, organizationProvider, provider } from "@/db/schema/app";
import { organization } from "@/db/schema/auth";
import { parseHeroMedia, parseLandingPage } from "@/lib/event-content";
import type { UpcomingEvent } from "@/types/events";

const UPCOMING_EVENTS_WINDOW_DAYS = 30;

export async function fetchUpcomingPublicEvents(
	limit = 500,
): Promise<UpcomingEvent[]> {
	const now = new Date();
	const windowEnd = new Date(
		now.getTime() + UPCOMING_EVENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	);

	const rows = await db
		.select({
			id: event.id,
			slug: event.slug,
			title: event.title,
			description: event.description,
			location: event.location,
			url: event.url,
			heroMedia: event.heroMedia,
			landingPage: event.landingPage,
			startAt: event.startAt,
			endAt: event.endAt,
			metadata: event.metadata,
			organizationId: organization.id,
			organizationName: organization.name,
			organizationSlug: organization.slug,
			providerName: provider.name,
		})
		.from(event)
		.innerJoin(provider, eq(provider.id, event.provider))
		.innerJoin(
			organizationProvider,
			eq(organizationProvider.providerId, provider.id),
		)
		.innerJoin(
			organization,
			eq(organization.id, organizationProvider.organizationId),
		)
		.where(
			and(
				eq(event.status, "approved"),
				eq(event.isPublished, true),
				gte(event.startAt, now),
				lte(event.startAt, windowEnd),
			),
		)
		.orderBy(event.startAt, event.id)
		.limit(limit);

	return rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		title: row.title,
		description: row.description,
		location: row.location,
		url: row.url,
		heroMedia: parseHeroMedia(row.heroMedia),
		landingPage: parseLandingPage(row.landingPage),
		startAt: row.startAt,
		endAt: row.endAt,
		organization: {
			id: row.organizationId,
			name: row.organizationName,
			slug: row.organizationSlug,
		},
		providerName: row.providerName,
		imageUrl:
			typeof row.metadata?.imageUrl === "string"
				? (row.metadata.imageUrl as string)
				: null,
	})) as UpcomingEvent[];
}
