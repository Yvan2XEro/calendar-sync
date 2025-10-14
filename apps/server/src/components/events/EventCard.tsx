"use client";

import {
	Calendar,
	CalendarPlus,
	CalendarRange,
	MailOpen,
	MapPin,
	Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	downloadICS,
	formatEventDateRange,
	getEventTimezone,
	getGoogleCalendarUrl,
	getOutlookCalendarUrl,
	getYahooCalendarUrl,
} from "@/lib/calendar-links";
import { buildEventDetailUrl } from "@/lib/events/urls";
import type { UpcomingEvent } from "@/types/events";

function buildDisplayRange(event: UpcomingEvent): string {
	return formatEventDateRange(event, (start, end, timeZone) => {
		const dateFormatter = new Intl.DateTimeFormat(undefined, {
			weekday: "short",
			month: "short",
			day: "numeric",
			timeZone: timeZone,
		});

		const timeFormatter = new Intl.DateTimeFormat(undefined, {
			hour: "numeric",
			minute: "2-digit",
			timeZone: timeZone,
		});

		const dateLabel = dateFormatter.format(start);
		const startLabel = timeFormatter.format(start);
		const endLabel = timeFormatter.format(end);

		if (startLabel === endLabel) {
			return `${dateLabel} · ${startLabel}`;
		}

		return `${dateLabel} · ${startLabel} – ${endLabel}`;
	});
}

export function EventCard({ event }: { event: UpcomingEvent }) {
	const imageUrl = event.imageUrl ?? null;
	const canonicalUrl = React.useMemo(
		() => buildEventDetailUrl(event.slug),
		[event.slug],
	);
	const calendarEvent = React.useMemo(
		() => ({
			...event,
			url: canonicalUrl,
		}),
		[event, canonicalUrl],
	);
	const calendarUrls = React.useMemo(
		() => ({
			google: getGoogleCalendarUrl(calendarEvent),
			outlook: getOutlookCalendarUrl(calendarEvent),
			yahoo: getYahooCalendarUrl(calendarEvent),
		}),
		[calendarEvent],
	);

	const timezone = React.useMemo(
		() => getEventTimezone(calendarEvent),
		[calendarEvent],
	);
	const rangeLabel = React.useMemo(
		() => buildDisplayRange(calendarEvent),
		[calendarEvent],
	);
	const description = calendarEvent.description?.trim();
	const participantCount = event.participantCount ?? 0;
	const showParticipants = participantCount > 0;

	return (
		<Card className="flex h-full min-w-[280px] flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/90 shadow-sm transition-shadow hover:shadow-md md:min-w-[320px]">
			<div className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-primary/10 via-muted/60 to-transparent">
				{imageUrl ? (
					<Image
						src={imageUrl}
						alt="Event artwork"
						fill
						className="object-cover"
						sizes="(max-width: 768px) 100vw, 320px"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-muted-foreground">
						<CalendarRange className="size-8" aria-hidden />
					</div>
				)}
			</div>

			<div className="flex flex-1 flex-col gap-4 p-5">
				<div className="space-y-2">
					<Badge
						variant="secondary"
						className="w-fit text-xs uppercase tracking-wide"
					>
						{event.organization.name}
					</Badge>
					<h3 className="font-semibold text-foreground text-lg leading-tight">
						{event.title}
					</h3>
					<p className="flex items-center gap-2 text-muted-foreground text-sm">
						<CalendarPlus className="size-4" aria-hidden />
						<span>
							{rangeLabel}
							{timezone ? (
								<span className="ml-1 text-xs uppercase">({timezone})</span>
							) : null}
						</span>
					</p>
					{event.location ? (
						<p className="flex items-start gap-2 text-muted-foreground text-sm">
							<MapPin className="mt-0.5 size-4" aria-hidden />
							<span className="line-clamp-2">{event.location}</span>
						</p>
					) : null}
					{showParticipants ? (
						<p className="flex items-center gap-2 text-muted-foreground text-sm">
							<Users className="size-4" aria-hidden />
							<span>
								{participantCount.toLocaleString()} participant
								{participantCount === 1 ? "" : "s"}
							</span>
						</p>
					) : null}
				</div>

				{description ? (
					<p className="line-clamp-3 text-muted-foreground text-sm leading-relaxed">
						{description}
					</p>
				) : null}

				<div className="mt-auto flex flex-wrap items-center gap-2">
					<Button asChild size="sm" variant="secondary">
						<a
							href={calendarUrls.google}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Add to Google Calendar"
						>
							<Calendar />
							Google
						</a>
					</Button>
					<Button asChild size="sm" variant="outline">
						<a
							href={calendarUrls.outlook}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Add to Outlook Calendar"
						>
							<MailOpen />
							Outlook
						</a>
					</Button>
					<Button asChild size="sm" variant="outline">
						<a
							href={calendarUrls.yahoo}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Add to Yahoo Calendar"
						>
							Yahoo
						</a>
					</Button>
					<Button
						size="sm"
						variant="ghost"
						type="button"
						onClick={() => downloadICS(calendarEvent)}
						aria-label="Download ICS file"
					>
						ICS
					</Button>
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="ml-auto text-primary"
					>
						<Link href={`/events/${event.slug}`}>View details</Link>
					</Button>
				</div>
			</div>
		</Card>
	);
}
