import { and, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { db } from "@/db";
import { event } from "@/db/schema/app";
import { buildAbsoluteUrl } from "@/lib/site-metadata";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const staticRoutes: MetadataRoute.Sitemap = [
		{
			url: buildAbsoluteUrl("/"),
		},
		{
			url: buildAbsoluteUrl("/contact"),
		},
		{
			url: buildAbsoluteUrl("/privacy"),
		},
		{
			url: buildAbsoluteUrl("/terms"),
		},
	];

	const rows = await db
		.select({
			slug: event.slug,
			updatedAt: event.updatedAt,
			createdAt: event.createdAt,
		})
		.from(event)
		.where(and(eq(event.isPublished, true), eq(event.status, "approved")));

	const eventRoutes: MetadataRoute.Sitemap = rows.map((row) => ({
		url: buildAbsoluteUrl(`/events/${row.slug}`),
		lastModified:
			(row.updatedAt ?? row.createdAt)?.toISOString?.() ?? undefined,
	}));

	return [...staticRoutes, ...eventRoutes];
}
