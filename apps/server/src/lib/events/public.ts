import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { event } from "@/db/schema/app";

type LandingMetadata = Record<string, unknown> & {
	slug?: string;
	landing?: Record<string, unknown>;
};

export type PublicEvent = {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	location: string | null;
	url: string | null;
	startAt: Date;
	endAt: Date | null;
	heroImageUrl: string | null;
	heroImageAlt: string | null;
	summary: string | null;
	marketingCopy: string | null;
	seoTitle: string | null;
	seoDescription: string | null;
	callToActionLabel: string | null;
	callToActionUrl: string | null;
	metadata: LandingMetadata;
};

export const getPublicEventBySlug = cache(async (slug: string) => {
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
				eq(event.isPublished, true),
				sql`(${event.metadata} ->> 'slug') = ${slug}`,
			),
		)
		.limit(1);

	const row = rows.at(0);
	if (!row) {
		return null;
	}

	const metadata = (row.metadata ?? {}) as LandingMetadata;
	const landing = (metadata.landing ?? {}) as Record<string, unknown>;
	const resolvedSlug =
		typeof metadata.slug === "string"
			? metadata.slug
			: typeof landing.slug === "string"
				? landing.slug
				: slug;

	const heroImageUrl =
		typeof landing.heroImageUrl === "string"
			? (landing.heroImageUrl as string)
			: null;
	const heroImageAlt =
		typeof landing.heroImageAlt === "string"
			? (landing.heroImageAlt as string)
			: row.title;
	const summary =
		typeof landing.summary === "string"
			? (landing.summary as string)
			: typeof metadata.summary === "string"
				? metadata.summary
				: row.description;
	const marketingCopy =
		typeof landing.marketingCopy === "string"
			? (landing.marketingCopy as string)
			: row.description;
	const seoTitle =
		typeof landing.seoTitle === "string"
			? (landing.seoTitle as string)
			: row.title;
	const seoDescription =
		typeof landing.seoDescription === "string"
			? (landing.seoDescription as string)
			: summary;
	const callToActionLabel =
		typeof landing.callToActionLabel === "string"
			? (landing.callToActionLabel as string)
			: null;
	const callToActionUrl =
		typeof landing.callToActionUrl === "string"
			? (landing.callToActionUrl as string)
			: null;

	return {
		id: row.id,
		slug: resolvedSlug,
		title: row.title,
		description: row.description ?? null,
		location: row.location ?? null,
		url: row.url ?? null,
		startAt: row.startAt,
		endAt: row.endAt,
		heroImageUrl,
		heroImageAlt,
		summary: summary ?? null,
		marketingCopy: marketingCopy ?? null,
		seoTitle,
		seoDescription,
		callToActionLabel,
		callToActionUrl,
		metadata,
	} satisfies PublicEvent;
});
