"use client";

import { CalendarDays, ExternalLink, ShieldCheck, Tag } from "lucide-react";
import { statusOptionMap } from "@/app/(site)/admin/events/event-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { EventActionsMenu } from "./EventActionsMenu";
import { EventPreview } from "./EventPreview";
import { statusActions } from "./status-actions";
import type { EventListItem } from "./types";

export type EventListViewProps = {
	events: EventListItem[];
	view: "table" | "card";
	selectedIds: string[];
	onSelect: (id: string, checked: boolean) => void;
	onSelectAll: (checked: boolean) => void;
	onEdit: (event: EventListItem) => void;
	onViewDetail: (id: string) => void;
	onStatusAction: (id: string, status: EventListItem["status"]) => void;
};

export function EventListView({
	events,
	view,
	selectedIds,
	onSelect,
	onSelectAll,
	onEdit,
	onViewDetail,
	onStatusAction,
}: EventListViewProps) {
	const selectedIdSet = new Set(selectedIds);
	const allSelectedOnPage =
		events.length > 0 && events.every((event) => selectedIdSet.has(event.id));
	const headerCheckboxState = selectedIds.length
		? allSelectedOnPage
			? true
			: "indeterminate"
		: false;

	if (view === "card") {
		return (
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{events.map((event) => {
					const isSelected = selectedIdSet.has(event.id);
					return (
						<Card
							key={event.id}
							className={cn(
								"relative flex h-full flex-col border",
								isSelected &&
									"border-primary/60 shadow-[0_0_0_1px_rgba(59,130,246,0.4)]",
							)}
						>
							<CardHeader className="space-y-3">
								<div className="flex items-start justify-between gap-3">
									<EventPreview
										event={event}
										layout="card"
										inlineTitle={false}
										badgePrefix={
											<>
												<Checkbox
													checked={isSelected}
													onCheckedChange={(checked) =>
														onSelect(event.id, Boolean(checked))
													}
													aria-label={`Select event ${event.title}`}
												/>
												<Badge
													variant={statusOptionMap[event.status].badgeVariant}
												>
													{statusOptionMap[event.status].label}
												</Badge>
											</>
										}
										titleSlot={
											<CardTitle className="line-clamp-2 break-words text-xl leading-tight">
												{event.title}
											</CardTitle>
										}
									/>
									<EventActionsMenu
										statusActions={statusActions}
										onUpdateStatus={(status) =>
											onStatusAction(event.id, status)
										}
										onEdit={() => onEdit(event)}
										onView={() => onViewDetail(event.id)}
									/>
								</div>
							</CardHeader>
							<CardContent className="flex flex-1 flex-col gap-4">
								<div className="flex flex-wrap gap-2 text-muted-foreground text-xs sm:text-sm">
									<span className="flex items-center gap-2 rounded-md border bg-muted/60 px-2 py-1">
										<Tag className="size-4" />
										Priority {event.priority}
									</span>
									<span className="flex items-center gap-2 rounded-md border bg-muted/60 px-2 py-1 text-muted-foreground">
										<ExternalLink className="size-4" />
										{event.isPublished ? "Published" : "Draft"}
									</span>
								</div>
								<div className="space-y-2 text-sm">
									<p className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground">
										<CalendarDays className="size-4 shrink-0" />
										<span className="min-w-0 break-words">
											Provider: {event.provider?.name ?? "Unassigned"}
											{event.provider?.category
												? ` • ${event.provider.category}`
												: ""}
										</span>
									</p>
									{event.flag ? (
										<p className="flex items-center gap-2 text-muted-foreground">
											<Tag className="size-4" />
											Flagged: {event.flag.label}
										</p>
									) : null}
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-lg border">
			<Table>
				<TableHeader className="bg-muted/40">
					<TableRow>
						<TableHead className="w-12">
							<Checkbox
								checked={headerCheckboxState}
								onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
								aria-label="Select all events"
							/>
						</TableHead>
						<TableHead className="min-w-[260px]">Event</TableHead>
						<TableHead>Provider</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Priority</TableHead>
						<TableHead>Published</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{events.map((event) => {
						const isSelected = selectedIdSet.has(event.id);
						return (
							<TableRow key={event.id} className="align-top">
								<TableCell>
									<Checkbox
										checked={isSelected}
										onCheckedChange={(checked) =>
											onSelect(event.id, Boolean(checked))
										}
										aria-label={`Select event ${event.title}`}
									/>
								</TableCell>
								<TableCell className="max-w-[420px]">
									<EventPreview event={event} />
								</TableCell>
								<TableCell>
									<div className="flex flex-col">
										<span className="font-medium text-sm">
											{event.provider?.name ?? "Unassigned"}
										</span>
										{event.provider?.category ? (
											<span className="text-muted-foreground text-xs">
												{event.provider.category}
											</span>
										) : null}
									</div>
								</TableCell>
                                                                <TableCell>
                                                                        <div className="flex flex-col gap-1">
                                                                                <Badge variant={statusOptionMap[event.status].badgeVariant}>
                                                                                        {statusOptionMap[event.status].label}
                                                                                </Badge>
                                                                                {event.autoApproval ? (
                                                                                        <span className="flex items-center gap-1 text-muted-foreground text-xs">
                                                                                                <ShieldCheck className="size-3" />
                                                                                                Auto-approved
                                                                                                {event.autoApproval.trustedProvider
                                                                                                        ? " (trusted provider)"
                                                                                                        : ""}
                                                                                        </span>
                                                                                ) : null}
                                                                        </div>
                                                                </TableCell>
								<TableCell>
									<Badge variant="outline">{event.priority}</Badge>
								</TableCell>
								<TableCell>
									<Badge variant={event.isPublished ? "default" : "outline"}>
										{event.isPublished ? "Published" : "Draft"}
									</Badge>
								</TableCell>
								<TableCell className="text-right">
									<EventActionsMenu
										statusActions={statusActions}
										onUpdateStatus={(status) =>
											onStatusAction(event.id, status)
										}
										onEdit={() => onEdit(event)}
										onView={() => onViewDetail(event.id)}
									/>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
