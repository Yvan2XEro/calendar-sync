import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/datetime";
import type { EventLandingPageContent } from "@/lib/event-content";

function splitParagraphs(body: string | null | undefined) {
	if (!body) return [];
	const trimmed = body.trim();
	if (trimmed.length === 0) return [];
	return trimmed.split(/\n{2,}/);
}

type EventLandingDetailsProps = {
	description: string | null;
	landing: EventLandingPageContent | null;
	startAt: Date;
	endAt: Date | null;
	location: string | null;
	fallbackUrl: string | null;
};

export function EventLandingDetails({
	description,
	landing,
	startAt,
	endAt,
	location,
	fallbackUrl,
}: EventLandingDetailsProps) {
	const paragraphs = splitParagraphs(landing?.body);
	const ctaHref = landing?.cta?.href ?? fallbackUrl ?? null;
	const ctaLabel = landing?.cta?.label ?? (ctaHref ? "Visit event site" : null);

	return (
		<section className="container mx-auto grid gap-8 px-6 py-12 sm:px-12">
			<Card>
				<CardContent className="grid gap-6 px-6 py-8 sm:grid-cols-2">
					<div className="space-y-3 text-sm">
						<p className="font-semibold text-base text-foreground">Schedule</p>
						<p className="text-muted-foreground">
							Starts: {formatDisplayDate(startAt)}
						</p>
						{endAt ? (
							<p className="text-muted-foreground">
								Ends: {formatDisplayDate(endAt)}
							</p>
						) : null}
						{location ? (
							<p className="text-muted-foreground">Location: {location}</p>
						) : null}
					</div>
					<div className="space-y-3 text-sm">
						{description ? (
							<div className="space-y-2">
								<p className="font-semibold text-base text-foreground">
									Overview
								</p>
								<p className="whitespace-pre-wrap text-muted-foreground">
									{description}
								</p>
							</div>
						) : null}
						{paragraphs.length > 0 ? (
							<div className="space-y-2">
								<p className="font-semibold text-base text-foreground">
									Details
								</p>
								<div className="space-y-3 text-muted-foreground">
									{paragraphs.map((paragraph, index) => (
										<p
											key={index}
											className="whitespace-pre-wrap leading-relaxed"
										>
											{paragraph}
										</p>
									))}
								</div>
							</div>
						) : null}
						{landing?.seoDescription ? (
							<p className="text-muted-foreground text-xs">
								{landing.seoDescription}
							</p>
						) : null}
						{ctaHref && ctaLabel ? (
							<Button asChild className="mt-2 w-fit">
								<a href={ctaHref} target="_blank" rel="noopener noreferrer">
									{ctaLabel}
								</a>
							</Button>
						) : null}
					</div>
				</CardContent>
			</Card>
		</section>
	);
}
