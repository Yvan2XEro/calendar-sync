import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { EventRegistrationSection } from "@/components/events/EventRegistrationSection";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/datetime";
import { getPublicEventBySlug } from "@/lib/events/public";
import { getEventTicketInventory } from "@/lib/events/registration";

export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: { slug: string };
}): Promise<Metadata> {
	const event = await getPublicEventBySlug(params.slug);
	if (!event) {
		return { title: "Event not found" };
	}
	const description = event.seoDescription ?? event.summary ?? undefined;
	return {
		title: event.seoTitle ?? event.title,
		description,
		openGraph: {
			title: event.seoTitle ?? event.title,
			description,
			images: event.heroImageUrl
				? [{ url: event.heroImageUrl, alt: event.heroImageAlt ?? event.title }]
				: undefined,
		},
		twitter: {
			card: "summary_large_image",
			title: event.seoTitle ?? event.title,
			description,
			images: event.heroImageUrl ?? undefined,
		},
	};
}

type PageProps = {
	params: { slug: string };
};

export default async function EventLandingPage({ params }: PageProps) {
	const event = await getPublicEventBySlug(params.slug);
	if (!event) {
		notFound();
	}

	const inventory = await getEventTicketInventory(event.id);
	const tickets = inventory.map(
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

	return (
		<div className="bg-background text-foreground">
			<section className="relative overflow-hidden">
				{event.heroImageUrl ? (
					<div className="relative h-60 w-full sm:h-80">
						<Image
							src={event.heroImageUrl}
							alt={event.heroImageAlt ?? event.title}
							fill
							priority
							className="object-cover"
						/>
						<div className="absolute inset-0 bg-black/45" aria-hidden />
						<div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 py-6 text-white lg:px-6">
							<Badge
								variant="secondary"
								className="mb-3 bg-white/20 text-white"
							>
								Upcoming event
							</Badge>
							<h1 className="font-semibold text-3xl sm:text-4xl md:text-5xl">
								{event.title}
							</h1>
							<p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
								{event.summary ?? event.description}
							</p>
						</div>
					</div>
				) : (
					<div className="bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20">
						<div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-12 text-primary-foreground lg:px-6">
							<Badge
								variant="secondary"
								className="w-fit bg-primary/20 text-primary"
							>
								Upcoming event
							</Badge>
							<h1 className="font-semibold text-3xl text-primary-foreground sm:text-4xl md:text-5xl">
								{event.title}
							</h1>
							<p className="max-w-2xl text-base text-primary-foreground/80">
								{event.summary ?? event.description}
							</p>
						</div>
					</div>
				)}
			</section>
			<main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 lg:flex-row lg:px-6">
				<div className="flex-1 space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Event details</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4 text-sm leading-relaxed">
							{event.startAt && (
								<div>
									<p className="font-medium">When</p>
									<p className="text-muted-foreground">
										{formatDisplayDate(event.startAt)}
										{event.endAt ? ` — ${formatDisplayDate(event.endAt)}` : ""}
									</p>
								</div>
							)}
							{event.location && (
								<div>
									<p className="font-medium">Where</p>
									<p className="text-muted-foreground">{event.location}</p>
								</div>
							)}
							{event.url && (
								<div>
									<p className="font-medium">Official link</p>
									<a
										href={event.url}
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary underline-offset-4 hover:underline"
									>
										{event.url}
									</a>
								</div>
							)}
							{event.marketingCopy && (
								<div>
									<p className="font-medium">About</p>
									<p className="whitespace-pre-line text-muted-foreground">
										{event.marketingCopy}
									</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
				<div className="flex-1">
					<EventRegistrationSection
						eventId={event.id}
						eventTitle={event.title}
						tickets={tickets}
					/>
				</div>
			</main>
		</div>
	);
}
