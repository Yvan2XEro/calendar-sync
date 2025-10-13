"use client";

import "@/styles/big-calendar.css";

import { addHours, format } from "date-fns";
import {
	AlertCircle,
	Calendar,
	CalendarClock,
	CalendarPlus,
	Clock,
	Filter,
	LinkIcon,
	Loader2,
	MailOpen,
	MapPin,
	RefreshCw,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { EventProps } from "react-big-calendar";
import { Views } from "react-big-calendar";

import { BigCalendar, localizer } from "@/components/BigCalendar";
import { BigCalendarToolbar } from "@/components/BigCalendarToolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	downloadICS,
	formatDateBadge,
	formatEventDateRange,
	getEventTimezone,
	getGoogleCalendarUrl,
	getOutlookCalendarUrl,
	getYahooCalendarUrl,
} from "@/lib/calendar-links";
import { cn } from "@/lib/utils";
import type { UpcomingEvent } from "@/types/events";

type EventsCalendarProps = {
	events: UpcomingEvent[];
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	onRetry: () => void;
};

type CalendarEvent = UpcomingEvent & {
	start: Date;
	end: Date;
};

export function EventsCalendar({
	events,
	isLoading,
	isFetching,
	isError,
	onRetry,
}: EventsCalendarProps) {
	const [search, setSearch] = React.useState("");
	const [location, setLocation] = React.useState("all");
	const [date, setDate] = React.useState("");
	const [view, setView] = React.useState(Views.MONTH);
	const [calendarDate, setCalendarDate] = React.useState(new Date());
	const [selectedEventId, setSelectedEventId] = React.useState<string | null>(
		null,
	);

	const normalizedSearch = search.trim().toLowerCase();

	const locationOptions = React.useMemo(() => {
		const unique = new Map<string, string>();
		for (const event of events) {
			const label = event.location?.trim();
			if (!label || label.length === 0) continue;
			const key = label.toLowerCase();
			if (!unique.has(key)) {
				unique.set(key, label);
			}
		}
		return Array.from(unique.entries())
			.sort((a, b) => a[1].localeCompare(b[1]))
			.map(([value, label]) => ({ value, label }));
	}, [events]);

	const filteredEvents = React.useMemo(() => {
		if (events.length === 0) return [];

		return events.filter((event) => {
			const matchesLocation =
				location === "all" ||
				(event.location?.trim().toLowerCase() ?? "") === location.toLowerCase();

			const matchesDate = date.length === 0 || getEventDateKey(event) === date;

			const matchesSearch =
				normalizedSearch.length === 0 ||
				[
					event.title,
					event.description ?? "",
					event.organization.name,
					event.location ?? "",
					getEventTimezone(event) ?? "",
				]
					.join(" ")
					.toLowerCase()
					.includes(normalizedSearch);

			return matchesLocation && matchesDate && matchesSearch;
		});
	}, [events, location, date, normalizedSearch]);

	const calendarEvents = React.useMemo<CalendarEvent[]>(() => {
		return filteredEvents.map((event) => {
			const start = new Date(event.startAt);
			const end = event.endAt ? new Date(event.endAt) : addHours(start, 1);

			return {
				...event,
				start,
				end,
			};
		});
	}, [filteredEvents]);

	const isFiltering =
		normalizedSearch.length > 0 || location !== "all" || date.length > 0;

	const selectedEvent = React.useMemo(() => {
		if (!selectedEventId) return null;
		return calendarEvents.find((event) => event.id === selectedEventId) ?? null;
	}, [calendarEvents, selectedEventId]);

	const handleResetFilters = React.useCallback(() => {
		setSearch("");
		setLocation("all");
		setDate("");
	}, []);

	const handleNavigate = React.useCallback((newDate: Date) => {
		setCalendarDate(newDate);
	}, []);

	const handleViewChange = React.useCallback((newView: string) => {
		setView(newView as any);
	}, []);

	const handleSelectEvent = React.useCallback((event: CalendarEvent) => {
		setSelectedEventId(event.id);
	}, []);

	const handleModalOpenChange = React.useCallback((open: boolean) => {
		if (!open) {
			setSelectedEventId(null);
		}
	}, []);
	const calendarUrls = React.useMemo(
		() =>
			selectedEvent
				? {
						google: getGoogleCalendarUrl(selectedEvent),
						outlook: getOutlookCalendarUrl(selectedEvent),
						yahoo: getYahooCalendarUrl(selectedEvent),
					}
				: null,
		[selectedEvent],
	);

	return (
		<TooltipProvider delayDuration={200}>
			<section className="space-y-6">
				<Card className="space-y-3 rounded-3xl border-none bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 text-foreground shadow-sm">
					<div className="flex flex-col gap-2">
						<p className="text-muted-foreground text-sm">
							Upcoming programming
						</p>
						<h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
							Your events at a glance
						</h1>
						<p className="max-w-2xl text-muted-foreground text-sm">
							Explore approved events from the organizations you follow. Add
							them to your calendar in a click and stay aligned with your team.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
						<span>
							Showing {filteredEvents.length} of {events.length} upcoming events
						</span>
						{isFetching ? (
							<span className="inline-flex items-center gap-2">
								<Loader2 className="size-4 animate-spin" aria-hidden /> Syncing
								latest schedule
							</span>
						) : null}
					</div>
				</Card>

				<FiltersPanel
					search={search}
					onSearchChange={setSearch}
					location={location}
					onLocationChange={setLocation}
					locationOptions={locationOptions}
					date={date}
					onDateChange={setDate}
					onReset={handleResetFilters}
					isFiltering={isFiltering}
				/>

				{isLoading ? (
					<EventsCalendarSkeleton />
				) : isError ? (
					<CalendarErrorState onRetry={onRetry} />
				) : calendarEvents.length === 0 ? (
					<CalendarEmptyState
						isFiltering={isFiltering}
						onReset={handleResetFilters}
					/>
				) : (
					<Card className="rounded-3xl border border-border/60 bg-card/90 p-4 shadow-lg">
						<div className="rounded-2xl bg-background/60 p-3 shadow-inner">
							<BigCalendar
								localizer={localizer}
								views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
								date={calendarDate}
								onNavigate={handleNavigate}
								view={view}
								onView={handleViewChange}
								events={calendarEvents}
								startAccessor="start"
								endAccessor="end"
								style={{ height: 640 }}
								components={{
									toolbar: BigCalendarToolbar as any,
									event: CalendarEventContent,
								}}
								popup
								onSelectEvent={handleSelectEvent}
								dayPropGetter={() => ({
									className:
										"[&.rbc-today]:bg-primary/10 [&.rbc-today]:border [&.rbc-today]:border-primary/30",
								})}
								eventPropGetter={() => ({
									className:
										"!border-none !bg-transparent px-0 py-0 transition-[transform] hover:z-10 hover:scale-[1.01]",
								})}
							/>
						</div>
					</Card>
				)}
				<Dialog
					open={Boolean(selectedEvent)}
					onOpenChange={handleModalOpenChange}
				>
					<DialogContent className="min-w-[50vw] rounded-3xl">
						{selectedEvent ? (
							<>
								<DialogHeader>
									<DialogTitle className="text-balance font-semibold text-2xl">
										{selectedEvent.title}
									</DialogTitle>
								</DialogHeader>
								<ScrollArea className="max-h-[50vh] pr-4">
									<div className="space-y-4 py-2">
										<div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
											<Badge
												variant="secondary"
												className="rounded-full px-3 py-1"
											>
												{selectedEvent.organization.name}
											</Badge>
											<div className="inline-flex items-center gap-2">
												<CalendarClock className="size-4" aria-hidden />
												<span>
													{format(selectedEvent.start, "EEEE, MMMM d yyyy")}
												</span>
											</div>
											<div className="inline-flex items-center gap-2">
												<Clock className="size-4" aria-hidden />
												<span>
													{format(selectedEvent.start, "p")} –{" "}
													{format(selectedEvent.end, "p")}{" "}
													{getEventTimezone(selectedEvent)}
												</span>
											</div>
										</div>
										{selectedEvent.location ? (
											<div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
												<MapPin className="size-4" aria-hidden />
												<span>{selectedEvent.location}</span>
											</div>
										) : null}
										<p className="text-foreground/80 text-sm leading-relaxed">
											{selectedEvent.description ??
												"No description provided for this event."}
										</p>
									</div>
								</ScrollArea>
								{!!selectedEvent && !!calendarUrls && (
									<DialogFooter className="justify-center gap-2">
										{selectedEvent.slug ? (
											<Button asChild>
												<Link
													href={`/events/${selectedEvent.slug}`}
													target="_blank"
													rel="noopener noreferrer"
												>
													<LinkIcon className="mr-2 size-4" aria-hidden /> View
													landing page
												</Link>
											</Button>
										) : null}

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
											onClick={() => downloadICS(selectedEvent)}
											aria-label="Download ICS file"
										>
											ICS
										</Button>
									</DialogFooter>
								)}
							</>
						) : null}
					</DialogContent>
				</Dialog>
			</section>
		</TooltipProvider>
	);
}

function CalendarEventContent({ event }: EventProps<CalendarEvent>) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						"flex h-full w-full flex-col justify-center gap-1 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-left text-xs shadow-sm transition-colors",
						"hover:border-primary/40 hover:bg-primary/15 dark:border-primary/30 dark:bg-primary/15",
					)}
				>
					<span className="line-clamp-2 font-medium text-primary text-sm">
						{event.title}
					</span>
					<div className="flex flex-wrap items-center gap-1 text-muted-foreground">
						<Badge
							variant="outline"
							className="rounded-full border-primary/20 bg-background/80 px-2 py-0 font-medium text-[10px] text-primary"
						>
							{event.organization.name}
						</Badge>
						<span>{format(event.start, "p")}</span>
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs rounded-xl border-border/60 bg-card p-3 text-left">
				<p className="font-medium text-foreground text-sm">{event.title}</p>
				<p className="text-muted-foreground text-xs">
					{format(event.start, "EEEE, MMM d • p")} – {format(event.end, "p")}
				</p>
				{event.location ? (
					<p className="mt-1 text-muted-foreground text-xs">{event.location}</p>
				) : null}
			</TooltipContent>
		</Tooltip>
	);
}

function FiltersPanel({
	search,
	onSearchChange,
	location,
	onLocationChange,
	locationOptions,
	date,
	onDateChange,
	onReset,
	isFiltering,
}: {
	search: string;
	onSearchChange: (value: string) => void;
	location: string;
	onLocationChange: (value: string) => void;
	locationOptions: { value: string; label: string }[];
	date: string;
	onDateChange: (value: string) => void;
	onReset: () => void;
	isFiltering: boolean;
}) {
	return (
		<Card className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<Filter className="size-4" aria-hidden />
				<span>Refine what you see</span>
			</div>
			<div className="grid gap-4 md:grid-cols-3">
				<div className="flex flex-col gap-2">
					<Label htmlFor="events-search">Search</Label>
					<Input
						id="events-search"
						value={search}
						placeholder="Search by title, organization, or keyword"
						onChange={(event) => onSearchChange(event.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label>Location</Label>
					<Select value={location} onValueChange={onLocationChange}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="All locations" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All locations</SelectItem>
							{locationOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="events-date">Start date</Label>
					<Input
						id="events-date"
						type="date"
						value={date}
						onChange={(event) => onDateChange(event.target.value)}
					/>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onReset}
					disabled={!isFiltering}
				>
					<RefreshCw className="mr-2 size-4" aria-hidden /> Reset filters
				</Button>
				{isFiltering ? (
					<span className="text-muted-foreground text-xs">
						Adjust filters to broaden your view.
					</span>
				) : null}
			</div>
		</Card>
	);
}

function EventsCalendarSkeleton() {
	return (
		<Card className="rounded-3xl border border-border/60 bg-card/80 p-4 shadow-sm">
			<Skeleton className="h-8 w-48" />
			<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<Skeleton key={index} className="h-32 rounded-2xl" />
				))}
			</div>
		</Card>
	);
}

function CalendarErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<Card className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center text-destructive">
			<AlertCircle className="size-8" aria-hidden />
			<div className="space-y-2">
				<h2 className="font-semibold text-lg">We couldn’t load your events</h2>
				<p className="text-sm">Check your connection and try again.</p>
			</div>
			<Button variant="destructive" onClick={onRetry} type="button">
				Try again
			</Button>
		</Card>
	);
}

function CalendarEmptyState({
	isFiltering,
	onReset,
}: {
	isFiltering: boolean;
	onReset: () => void;
}) {
	return (
		<Card className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 border-dashed bg-card/60 p-8 text-center text-muted-foreground">
			<div className="space-y-2">
				<h2 className="font-semibold text-foreground text-lg">
					{isFiltering ? "No events match your filters" : "No upcoming events"}
				</h2>
				<p className="text-sm">
					{isFiltering
						? "Broaden your filters or clear them to see more programming."
						: "Once organizations publish new events they’ll show up here."}
				</p>
			</div>
			{isFiltering ? (
				<Button type="button" variant="outline" onClick={onReset}>
					Clear filters
				</Button>
			) : null}
		</Card>
	);
}

function getEventDateKey(event: UpcomingEvent): string {
	return formatDateBadge(event);
}

export default EventsCalendar;
