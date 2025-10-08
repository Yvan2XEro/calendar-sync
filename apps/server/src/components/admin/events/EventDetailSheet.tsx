"use client";

import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentProps } from "react";
import type { UrlObject } from "url";
import { statusOptionMap } from "@/app/(site)/admin/events/event-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { formatDisplayDate } from "@/lib/datetime";
import { hasLandingContent } from "@/lib/event-content";
import { EventAnalyticsSummary } from "./EventAnalyticsSummary";
import type { StatusAction } from "./status-actions";
import type { EventListItem } from "./types";

type VisibilityBadge = {
	label: string;
	variant: ComponentProps<typeof Badge>["variant"];
};

function resolveVisibility(
	event: EventListItem | null,
): VisibilityBadge | null {
	if (!event) return null;
	if (event.status === "approved" && event.isPublished) {
		return { label: "Published", variant: "default" };
	}
	if (event.status === "approved") {
		return { label: "Approved draft", variant: "secondary" };
	}
	if (event.status === "pending") {
		return { label: "Pending review", variant: "outline" };
	}
	return { label: "Archived", variant: "outline" };
}

type EventDetailSheetProps = {
	event: EventListItem | null;
	statusActions: StatusAction[];
	onUpdateStatus: (eventId: string, action: StatusAction) => void;
	onEdit: (event: EventListItem) => void;
	onClose: () => void;
	statusLoading: boolean;
	onDelete: (event: EventListItem) => void;
	isDeleting: boolean;
};

export function EventDetailSheet({
	event,
	statusActions,
	onUpdateStatus,
	onEdit,
	onClose,
	statusLoading,
	onDelete,
	isDeleting,
}: EventDetailSheetProps) {
	const autoApproval = event?.autoApproval ?? null;
	const autoApprovalReason =
		autoApproval?.reason.replace(/_/g, " ") ?? "Unknown";
	const autoApprovalTimestamp = autoApproval?.at
		? new Date(autoApproval.at)
		: null;
	const publicHref: UrlObject | null = event
		? { pathname: "/events/[slug]", query: { slug: event.slug } }
		: null;
	const heroMedia = event?.heroMedia ?? null;
	const hasHero = Boolean(heroMedia?.type && heroMedia?.url);
	const landing = event?.landingPage ?? null;
	const hasLanding = hasLandingContent(landing);
	const landingBodyParagraphs =
		typeof landing?.body === "string" && landing.body.trim().length > 0
			? landing.body.trim().split(/\n{2,}/)
			: [];
	const visibility = resolveVisibility(event);
	const statusKey = (event?.status ?? "pending") as keyof typeof statusOptionMap;
	const statusConfig = statusOptionMap[statusKey];
	return (
		<Sheet
			open={event != null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<SheetContent
				side="right"
				className="min-w-2xl max-w-2xl overflow-y-auto p-3"
			>
				<SheetHeader>
					<SheetTitle>{event?.title ?? "Event details"}</SheetTitle>
					<SheetDescription>
						Review the synchronized metadata before applying moderation changes.
					</SheetDescription>
				</SheetHeader>
				{event ? (
					<div className="mt-6 space-y-6">
						<div className="flex flex-wrap items-center gap-2">
							<Button asChild size="sm" variant="outline">
								<Link
									href={{
										pathname: "/admin/events/[id]/attendees",
										query: { id: event.id },
									}}
								>
									Open attendee roster
								</Link>
							</Button>
						</div>
						<div className="space-y-2">
							<p className="text-muted-foreground text-sm">
								Event ID: {event.id}
							</p>
							{event.externalId ? (
								<p className="text-muted-foreground text-sm">
									External ID: {event.externalId}
								</p>
							) : null}
							<div className="flex flex-wrap gap-2">
								<Badge variant={statusConfig.badgeVariant}>
									{statusConfig.label}
								</Badge>
								{visibility ? (
									<Badge variant={visibility.variant}>{visibility.label}</Badge>
								) : null}
						{event.isAllDay ? (
									<Badge variant="outline">All-day</Badge>
								) : null}
								{autoApproval ? (
									<Badge variant="secondary" className="gap-1">
										<ShieldCheck className="size-3" />
										Auto-approved
										{autoApproval.trustedProvider ? " (trusted provider)" : ""}
									</Badge>
								) : null}
							</div>
							{autoApproval ? (
								<div className="rounded-md border border-dashed bg-muted/40 p-3 text-muted-foreground text-sm">
									<p className="flex items-center gap-2 font-medium text-foreground">
										<ShieldCheck className="size-4" />
										Auto-approval details
									</p>
									<p>
										Reason: {autoApprovalReason}
										{autoApproval.providerId
											? ` • Provider ID: ${autoApproval.providerId}`
											: ""}
									</p>
									{autoApprovalTimestamp ? (
										<p>Recorded at: {autoApprovalTimestamp.toLocaleString()}</p>
									) : null}
					</div>
				) : null}
						</div>
						<div className="space-y-1 text-sm">
							<p className="font-semibold text-foreground">Schedule</p>
							<p className="text-muted-foreground">
								Starts: {formatDisplayDate(event.startAt)}
							</p>
							{event.endAt ? (
								<p className="text-muted-foreground">
									Ends: {formatDisplayDate(event.endAt)}
								</p>
							) : null}
						</div>
						<div className="space-y-1 text-sm">
							<p className="font-semibold text-foreground">Location</p>
							<p className="text-muted-foreground">
								{event.location ?? "No location provided"}
							</p>
						</div>
						<div className="space-y-1 text-sm">
							<p className="font-semibold text-foreground">Provider</p>
							<p className="text-muted-foreground">
								{event.provider?.name ?? "Unassigned"}
							</p>
							{event.provider?.category ? (
								<p className="text-muted-foreground">
									{event.provider.category}
								</p>
							) : null}
						</div>
						<EventAnalyticsSummary eventId={event.id} />
						{publicHref ? (
							<div className="space-y-2 text-sm">
								<p className="font-semibold text-foreground">Public link</p>
								<div className="flex flex-wrap items-center gap-2">
									<code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
										{`/events/${event.slug}`}
									</code>
									<Button asChild size="sm" variant="outline">
										<Link
											href={publicHref}
											target="_blank"
											rel="noopener noreferrer"
										>
											View landing page
										</Link>
									</Button>
								</div>
							</div>
						) : null}
						{hasHero && heroMedia ? (
							<div className="space-y-2 text-sm">
								<p className="font-semibold text-foreground">Hero media</p>
								<div className="overflow-hidden rounded-md border bg-muted/40">
									{heroMedia.type === "video" ? (
										// biome-ignore lint/a11y/useMediaCaption: Caption tracks are unavailable for synchronized provider media
										<video
											controls
											poster={heroMedia.posterUrl ?? undefined}
											className="h-48 w-full bg-black"
										>
											<source src={heroMedia.url ?? ""} />
											Your browser does not support embedded videos.
										</video>
									) : (
										<Image
											src={heroMedia.url ?? ""}
											alt={heroMedia.alt ?? "Event hero media"}
											width={768}
											height={320}
											unoptimized
											className="h-48 w-full object-cover"
										/>
									)}
								</div>
								<p className="text-muted-foreground text-xs">
									{[
										heroMedia.type ? `Type: ${heroMedia.type}` : null,
										heroMedia.alt ? `Alt: ${heroMedia.alt}` : null,
										heroMedia.posterUrl
											? `Poster: ${heroMedia.posterUrl}`
											: null,
									]
										.filter((value): value is string => Boolean(value))
										.join(" • ")}
								</p>
							</div>
						) : null}
						{hasLanding && landing ? (
							<div className="space-y-2 text-sm">
								<p className="font-semibold text-foreground">
									Landing page content
								</p>
								{landing.headline ? (
									<p className="font-medium text-base text-foreground">
										{landing.headline}
									</p>
								) : null}
								{landing.subheadline ? (
									<p className="text-muted-foreground">{landing.subheadline}</p>
								) : null}
								{landingBodyParagraphs.length > 0 ? (
									<div className="space-y-2 text-muted-foreground">
										{landingBodyParagraphs.map((paragraph: string, index: number) => (
											<p
												key={`${index}-${paragraph.slice(0, 16)}`}
												className="whitespace-pre-wrap leading-relaxed"
											>
												{paragraph}
											</p>
										))}
									</div>
								) : null}
								{landing.seoDescription ? (
									<p className="text-muted-foreground text-xs">
										SEO description: {landing.seoDescription}
									</p>
								) : null}
								{landing.cta ? (
									<p className="text-muted-foreground text-xs">
										CTA: {landing.cta.label ?? ""}
										{landing.cta.href ? ` • ${landing.cta.href}` : ""}
									</p>
								) : null}
							</div>
						) : null}
						{event.description ? (
							<div className="space-y-1 text-sm">
								<p className="font-semibold text-foreground">Description</p>
								<p className="whitespace-pre-wrap text-muted-foreground">
									{event.description}
								</p>
							</div>
						) : null}
						<div className="space-y-1 text-sm">
							<p className="font-semibold text-foreground">Metadata</p>
							<pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-3 text-xs">
								{JSON.stringify(event.metadata ?? {}, null, 2)}
							</pre>
						</div>
						<div className="flex flex-wrap gap-2">
						{statusActions.map((action) => (
							<Button
								key={`${action.status}-${action.publish ?? "default"}`}
								onClick={() => onUpdateStatus(event.id, action)}
								disabled={statusLoading}
							>
									<action.icon className="mr-2 size-4" />
									{action.label}
								</Button>
							))}
							<Button variant="outline" onClick={() => onEdit(event)}>
								Edit event
							</Button>
							<Button
								variant="destructive"
								onClick={() => onDelete(event)}
								disabled={isDeleting}
							>
								{isDeleting ? "Deleting…" : "Delete event"}
							</Button>
						</div>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
