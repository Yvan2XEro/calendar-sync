import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { EventLandingDetails } from "@/components/events/EventLandingDetails";
import { EventLandingHero } from "@/components/events/EventLandingHero";
import { EventRegistrationSection } from "@/components/events/EventRegistrationSection";
import { db } from "@/db";
import { event } from "@/db/schema/app";
import {
	hasLandingContent,
	parseHeroMedia,
	parseLandingPage,
} from "@/lib/event-content";
import { getEventTicketInventory } from "@/lib/events/registration";
import { buildAbsoluteUrl, getSiteBaseUrl } from "@/lib/site-metadata";

const fetchPublishedEvent = cache(async (slug: string) => {
	const rows = await db
		.select({
			id: event.id,
			title: event.title,
			description: event.description,
			startAt: event.startAt,
			endAt: event.endAt,
			location: event.location,
			url: event.url,
			heroMedia: event.heroMedia,
			landingPage: event.landingPage,
			metadata: event.metadata,
			updatedAt: event.updatedAt,
			createdAt: event.createdAt,
			isPublished: event.isPublished,
			status: event.status,
		})
		.from(event)
		.where(
			and(
				eq(event.slug, slug),
				eq(event.isPublished, true),
				eq(event.status, "approved"),
			),
		)
		.limit(1);

	const row = rows.at(0);
	if (!row) return null;

	return {
		id: row.id,
		slug,
		title: row.title,
		description: row.description,
		startAt: row.startAt,
		endAt: row.endAt,
		location: row.location,
		url: row.url,
		heroMedia: parseHeroMedia(row.heroMedia),
		landingPage: parseLandingPage(row.landingPage),
		metadata: row.metadata ?? {},
		updatedAt: row.updatedAt,
		createdAt: row.createdAt,
	} as const;
});

export async function generateStaticParams() {
	try {
		const rows = await db
			.select({ slug: event.slug })
			.from(event)
			.where(and(eq(event.isPublished, true), eq(event.status, "approved")));
		return rows.map((row) => ({ slug: row.slug }));
	} catch (error) {
		console.warn("generateStaticParams skipped due to database error", error);
		return [];
	}
}

type EventRoute = "/events/[slug]";

export async function generateMetadata(
	props: PageProps<EventRoute>,
): Promise<Metadata> {
	try {
		const params = await props.params;
		const record = await fetchPublishedEvent(params.slug);
		if (!record) {
			return {
				title: "Event not found",
			} satisfies Metadata;
		}

		const canonical = buildAbsoluteUrl(`/events/${record.slug}`);
		const baseTitle = record.landingPage?.headline ?? record.title;
		const description =
			record.landingPage?.seoDescription ??
			record.landingPage?.subheadline ??
			record.description ??
			undefined;
		const hero = record.heroMedia;
		const images =
			hero?.type === "image" && hero.url ? [{ url: hero.url }] : undefined;
		const videos =
			hero?.type === "video" && hero.url
			? [
					{
						url: hero.url,
						width: 1280,
						height: 720,
						alt: hero.alt,
					},
				]
			: undefined;

		return {
			metadataBase: new URL(getSiteBaseUrl()),
			title: baseTitle,
			description,
			alternates: {
				canonical,
			},
			openGraph: {
				title: baseTitle,
				description,
				url: canonical,
				type: "article",
				images,
				videos,
				// startTime: record.startAt?.toISOString(),
				// endTime: record.endAt?.toISOString(),
				locale: "en_US",
			},
			twitter: {
				card: images?.length ? "summary_large_image" : "summary",
				title: baseTitle,
				description,
				images: images?.map((image) => image.url),
			},
		} satisfies Metadata;
	} catch (error) {
		console.warn("generateMetadata fallback due to database error", error);
		return {
			title: "Event",
			description: "Event details",
		} satisfies Metadata;
	}
}

export default async function EventLandingPage(
	props: PageProps<EventRoute>,
) {
	const params = await props.params;
	const record = await fetchPublishedEvent(params.slug);
	if (!record) notFound();

	const ticketsData = await getEventTicketInventory(record.id);
	const tickets = ticketsData.map(
		({ ticket, remaining, used, saleOpen, soldOut }) => ({
			id: ticket.id,
			name: ticket.name,
			description: ticket.description,
			priceCents: ticket.priceCents,
			currency: ticket.currency,
			capacity: ticket.capacity,
			maxPerOrder: ticket.maxPerOrder,
			remaining,
			used,
			saleOpen,
			soldOut,
			isWaitlistEnabled: ticket.isWaitlistEnabled,
		}),
	);
	const hasRegistration = tickets.length > 0;
	const hasOnSaleTicket = tickets.some(
		(ticket) => ticket.saleOpen && !ticket.soldOut,
	);

	const hasRichContent =
		hasLandingContent(record.landingPage) || Boolean(record.heroMedia?.url);
	// if (!hasRichContent && !hasRegistration) {
	// 	if (record.url) {
	// 		redirect(record.url);
	// 	}
	// 	notFound();
	// }

	let heroCtaHref = record.landingPage?.cta?.href ?? null;
	let heroCtaLabel = record.landingPage?.cta?.label ?? null;
	if (!heroCtaHref) {
		if (hasOnSaleTicket) {
			heroCtaHref = "#register";
			heroCtaLabel = heroCtaLabel ?? "Register now";
		} else if (record.url) {
			heroCtaHref = record.url;
			heroCtaLabel = heroCtaLabel ?? "Visit event site";
		}
	} else if (!heroCtaLabel) {
		heroCtaLabel = "Learn more";
	}

	const landingForDetails =
		heroCtaHref === "#register"
			? {
					...(record.landingPage ?? {}),
					cta: {
						label: heroCtaLabel ?? "Register now",
						href: "#register",
					},
				}
			: record.landingPage;

	return (
		<main className="flex min-h-screen flex-col bg-background">
			<EventLandingHero
				title={record.title}
				startAt={record.startAt}
				endAt={record.endAt}
				heroMedia={record.heroMedia}
				landing={record.landingPage}
				actionSlot={
					heroCtaHref && heroCtaLabel ? (
						<a
							className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 font-medium text-black text-sm shadow hover:bg-white/90"
							href={heroCtaHref}
							target={heroCtaHref.startsWith("#") ? undefined : "_blank"}
							rel={
								heroCtaHref.startsWith("#") ? undefined : "noopener noreferrer"
							}
						>
							{heroCtaLabel}
						</a>
					) : undefined
				}
			/>
			<EventLandingDetails
				description={record.description}
				landing={landingForDetails}
				startAt={record.startAt}
				endAt={record.endAt}
				location={record.location}
				fallbackUrl={record.url}
			/>
			{hasRegistration ? (
				<section
					id="register"
					className="container mx-auto w-full px-6 pb-16 sm:px-12"
				>
					<EventRegistrationSection
						eventId={record.id}
						eventTitle={record.title}
						tickets={tickets}
					/>
				</section>
			) : null}
		</main>
	);
}
