"use client";

import { CalendarClock, Clock, MapPin, ShieldCheck, Tag } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { CardDescription } from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { EventListItem } from "./types";

type EventPreviewProps = {
	event: EventListItem;
	layout?: "table" | "card";
	className?: string;
	titleSlot?: ReactNode;
	inlineTitle?: boolean;
	badgePrefix?: ReactNode;
};

export function EventPreview({
	event,
	layout = "table",
	className,
	titleSlot,
	inlineTitle = true,
	badgePrefix,
}: EventPreviewProps) {
	const containerClasses =
		layout === "card" ? "flex flex-col gap-3" : "flex flex-col gap-2";
	const scheduleClasses =
		layout === "card"
			? "space-y-1 text-muted-foreground text-sm"
			: "flex flex-col gap-1 text-muted-foreground text-xs leading-5";
	const locationClasses =
		layout === "card"
			? "flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground text-sm"
			: "flex min-w-0 flex-wrap items-center gap-1 text-muted-foreground text-xs leading-tight";
	const iconClasses = layout === "card" ? "size-4 shrink-0" : "size-3 shrink-0";
	const badgeIconClasses = "size-3";
	const badgeRowClasses = "flex flex-wrap items-center gap-2";
	const titleContent = titleSlot ?? (
		<span className="line-clamp-2 break-words font-medium text-sm leading-tight sm:text-base">
			{event.title}
		</span>
	);
	const locationText =
		layout === "card"
			? (event.location ?? "No location")
			: (event.location ?? "");
        const shouldRenderBadges =
                Boolean(badgePrefix) ||
                inlineTitle ||
                event.isAllDay ||
                Boolean(event.flag) ||
                Boolean(event.autoApproval);

	return (
		<div className={cn(containerClasses, className)}>
			{titleSlot && !inlineTitle ? titleSlot : null}
			{shouldRenderBadges ? (
				<div className={badgeRowClasses}>
					{badgePrefix}
                                        {inlineTitle ? titleContent : null}
                                        {event.isAllDay ? (
                                                <Badge variant="outline" className="uppercase">
                                                        All-day
                                                </Badge>
                                        ) : null}
                                        {event.autoApproval ? (
                                                <Badge variant="secondary" className="gap-1">
                                                        <ShieldCheck className={badgeIconClasses} />
                                                        <span className="min-w-0 break-words">
                                                                Auto-approved
                                                                {event.autoApproval.trustedProvider
                                                                        ? " (trusted provider)"
                                                                        : ""}
                                                        </span>
                                                </Badge>
                                        ) : null}
                                        {event.flag ? (
                                                <Badge variant="secondary" className="gap-1">
                                                        <Tag className={badgeIconClasses} />
                                                        <span className="min-w-0 break-words">{event.flag.label}</span>
                                                </Badge>
					) : null}
				</div>
			) : null}
			{!inlineTitle && !titleSlot ? titleContent : null}
			{event.description ? (
				layout === "card" ? (
					<CardDescription className="line-clamp-3 break-words text-sm leading-snug">
						{event.description}
					</CardDescription>
				) : (
					<p className="line-clamp-2 break-words text-muted-foreground text-sm leading-snug">
						{event.description}
					</p>
				)
			) : null}
			<div className={scheduleClasses}>
				<span className="flex min-w-0 flex-wrap items-center gap-1">
					<CalendarClock className={iconClasses} />
					<span className="min-w-0 break-words">
						{formatDisplayDate(event.startAt)}
					</span>
				</span>
				{event.endAt ? (
					<span className="flex min-w-0 flex-wrap items-center gap-1">
						<Clock className={iconClasses} />
						<span className="min-w-0 break-words">
							{formatDisplayDate(event.endAt)}
						</span>
					</span>
				) : null}
			</div>
			{locationText ? (
				<p className={locationClasses}>
					<MapPin className={iconClasses} />
					<span className="line-clamp-2 min-w-0 break-words">
						{locationText}
					</span>
				</p>
			) : null}
		</div>
	);
}
