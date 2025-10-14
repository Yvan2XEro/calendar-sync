import { buildAbsoluteUrl } from "@/lib/site-metadata";

export function buildEventDetailPath(slug: string): string {
	const normalized = slug.trim().replace(/^\/+|\/+$/g, "");
	return normalized.length > 0 ? `/events/${normalized}` : "/events";
}

export function buildEventDetailUrl(slug: string): string {
	return buildAbsoluteUrl(buildEventDetailPath(slug));
}
