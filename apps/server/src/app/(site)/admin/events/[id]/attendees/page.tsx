"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { statusOptionMap } from "@/app/(site)/admin/events/event-filters";
import { EventAnalyticsSummary } from "@/components/admin/events/EventAnalyticsSummary";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDisplayDate } from "@/lib/datetime";
import { eventKeys } from "@/lib/query-keys/events";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

function useDebouncedValue<T>(value: T, delay = 400) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const handle = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(handle);
	}, [value, delay]);
	return debounced;
}

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

type AttendeeListInput = RouterInputs["events"]["attendees"]["list"];
type UpdateAttendeeStatusInput =
	RouterInputs["events"]["attendees"]["updateStatus"];
type AttendeeExportInput = RouterInputs["events"]["attendees"]["export"];
type BulkAnnouncementInput = RouterInputs["events"]["attendees"]["announce"];

type AttendeeListOutput = RouterOutputs["events"]["attendees"]["list"];
type AttendeeListItem = AttendeeListOutput["items"][number];
type AttendeeExportOutput = RouterOutputs["events"]["attendees"]["export"];
type BulkAnnouncementOutput = RouterOutputs["events"]["attendees"]["announce"];

type EventDetailOutput = RouterOutputs["events"]["get"];

const statusSegments = [
	"all",
	"registered",
	"checked_in",
	"waitlisted",
	"cancelled",
] as const;
type StatusSegment = (typeof statusSegments)[number];

const checkInFilters = ["all", "checked_in", "not_checked_in"] as const;
type CheckInFilter = (typeof checkInFilters)[number];

const statusLabels: Record<AttendeeListItem["status"], string> = {
	reserved: "Reserved",
	registered: "Registered",
	checked_in: "Checked-in",
	cancelled: "Cancelled",
	waitlisted: "Waitlisted",
};

const statusVariants: Record<
	AttendeeListItem["status"],
	"default" | "secondary" | "outline" | "destructive"
> = {
	reserved: "outline",
	registered: "secondary",
	checked_in: "default",
	cancelled: "destructive",
	waitlisted: "secondary",
};

const pageSize = 25;

const textareaStyles =
	"min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function EventAttendeesPage() {
	const params = useParams<{ id: string }>();
	const rawEventId = params?.id;
	const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;

	const [page, setPage] = useState(1);
	const [search, setSearch] = useState("");
	const [statusSegment, setStatusSegment] = useState<StatusSegment>("all");
	const [checkInFilter, setCheckInFilter] = useState<CheckInFilter>("all");
	const [noShowOnly, setNoShowOnly] = useState(false);
	const [sort, setSort] = useState<AttendeeListInput["sort"]>("created_desc");
	const [isAnnouncementOpen, setAnnouncementOpen] = useState(false);
	const [announcementSubject, setAnnouncementSubject] = useState("");
	const [announcementMessage, setAnnouncementMessage] = useState("");
	const [announcementAudience, setAnnouncementAudience] =
		useState<BulkAnnouncementInput["audience"]>("all");
	const idPrefix = useId();
	const searchInputId = `${idPrefix}-search`;
	const statusSelectId = `${idPrefix}-status`;
	const checkInSelectId = `${idPrefix}-check-in`;
	const sortSelectId = `${idPrefix}-sort`;
	const noShowCheckboxId = `${idPrefix}-no-show`;
	const audienceSelectId = `${idPrefix}-audience`;
	const subjectInputId = `${idPrefix}-subject`;
	const messageTextareaId = `${idPrefix}-message`;
	const skeletonRowKeys = useMemo(
		() =>
			Array.from(
				{ length: pageSize },
				(_, index) => `${idPrefix}-loading-${index}`,
			),
		[idPrefix],
	);

	const debouncedSearch = useDebouncedValue(search);
	const queryClient = useQueryClient();

	const listParams = useMemo(() => {
		if (!eventId) {
			return null;
		}
		const params: AttendeeListInput = {
			eventId,
			page,
			limit: pageSize,
			sort,
		};
		if (debouncedSearch.trim().length > 0) {
			params.q = debouncedSearch.trim();
		}
		if (statusSegment === "registered") {
			params.status = ["registered", "reserved"];
		} else if (statusSegment === "checked_in") {
			params.status = ["checked_in"];
		} else if (statusSegment === "waitlisted") {
			params.status = ["waitlisted"];
		} else if (statusSegment === "cancelled") {
			params.status = ["cancelled"];
		}
		if (checkInFilter === "checked_in") {
			params.checkedIn = "checked_in";
		} else if (checkInFilter === "not_checked_in") {
			params.checkedIn = "not_checked_in";
		}
		if (noShowOnly) {
			params.noShow = true;
		}
		return params;
	}, [
		eventId,
		page,
		sort,
		debouncedSearch,
		statusSegment,
		checkInFilter,
		noShowOnly,
	]);

	const exportParams: AttendeeExportInput | null = useMemo(() => {
		if (!listParams) return null;
		const { eventId: exportEventId, status, checkedIn, noShow, q } = listParams;
		const payload: AttendeeExportInput = { eventId: exportEventId };
		if (status) payload.status = status;
		if (checkedIn) payload.checkedIn = checkedIn;
		if (noShow !== undefined) payload.noShow = noShow;
		if (q) payload.q = q;
		return payload;
	}, [listParams]);

	const eventQuery = useQuery<EventDetailOutput, Error>({
		queryKey: [...eventKeys.all, "detail", eventId ?? "unknown"] as const,
		queryFn: () => trpcClient.events.get.query({ id: eventId ?? "" }),
		enabled: Boolean(eventId),
	});

	const attendeesQuery = useQuery<AttendeeListOutput, Error>({
		queryKey: listParams
			? eventKeys.attendees.list(listParams.eventId, listParams)
			: ([
					...eventKeys.attendees.root(eventId ?? "unknown"),
					"list",
					"idle",
				] as const),
		queryFn: () => {
			if (!listParams) {
				return Promise.resolve({
					items: [],
					total: 0,
					page: 1,
					limit: pageSize,
				} as AttendeeListOutput);
			}
			return trpcClient.events.attendees.list.query(listParams);
		},
		enabled: Boolean(listParams),
		placeholderData: (previous: AttendeeListOutput | undefined) => previous,
	});

	const updateStatusMutation = useMutation<
		AttendeeListItem,
		Error,
		UpdateAttendeeStatusInput
	>({
		mutationFn: (variables) =>
			trpcClient.events.attendees.updateStatus.mutate(variables),
		onSuccess: () => {
			toast.success("Attendee updated");
			queryClient.invalidateQueries({
				queryKey: eventKeys.attendees.root(eventId ?? ""),
			});
			queryClient.invalidateQueries({
				queryKey: eventKeys.analytics.root(eventId ?? ""),
			});
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	const exportMutation = useMutation<
		AttendeeExportOutput,
		Error,
		AttendeeExportInput
	>({
		mutationFn: (variables: AttendeeExportInput) =>
			trpcClient.events.attendees.export.mutate(variables),
		onSuccess: (data) => {
			const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = data.filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
			toast.success(`Export ready (${data.count} rows)`);
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	const announcementMutation = useMutation<
		BulkAnnouncementOutput,
		Error,
		BulkAnnouncementInput
	>({
		mutationFn: (variables: BulkAnnouncementInput) =>
			trpcClient.events.attendees.announce.mutate(variables),
		onSuccess: (result) => {
			toast.success(
				`Queued ${result.queued} announcement${result.queued === 1 ? "" : "s"}`,
			);
			setAnnouncementOpen(false);
			setAnnouncementMessage("");
			setAnnouncementSubject("");
			queryClient.invalidateQueries({
				queryKey: eventKeys.analytics.root(eventId ?? ""),
			});
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	useEffect(() => {
		const total = attendeesQuery.data?.total ?? 0;
		const limit = attendeesQuery.data?.limit ?? pageSize;
		const totalPages = Math.max(1, Math.ceil(total / limit));
		if (page > totalPages) {
			setPage(totalPages);
		}
	}, [attendeesQuery.data, page]);

	if (!eventId) {
		return (
			<AppShell
				breadcrumbs={[{ label: "Admin", href: "/admin/overview" }]}
				headerRight={<UserAvatar />}
			>
				<Card>
					<CardHeader>
						<CardTitle>Invalid event</CardTitle>
						<CardDescription>
							The attendee roster could not be loaded.
						</CardDescription>
					</CardHeader>
				</Card>
			</AppShell>
		);
	}

	const attendees = attendeesQuery.data?.items ?? [];
	const total = attendeesQuery.data?.total ?? 0;
	const limit = attendeesQuery.data?.limit ?? pageSize;
	const totalPages = Math.max(1, Math.ceil(total / limit));
	const eventTitle = eventQuery.data?.title ?? "Event";
	const eventDetail = eventQuery.data ?? null;

	const handleCheckIn = (attendee: AttendeeListItem) => {
		const payload: UpdateAttendeeStatusInput = {
			attendeeId: attendee.id,
			status: "checked_in",
		};
		updateStatusMutation.mutate(payload);
	};

	const handleResetCheckIn = (attendee: AttendeeListItem) => {
		const payload: UpdateAttendeeStatusInput = {
			attendeeId: attendee.id,
			status: "registered",
			noShow: attendee.noShow,
		};
		updateStatusMutation.mutate(payload);
	};

	const handleMarkNoShow = (attendee: AttendeeListItem) => {
		const nextStatus =
			attendee.status === "checked_in" ? "registered" : attendee.status;
		const payload: UpdateAttendeeStatusInput = {
			attendeeId: attendee.id,
			status: nextStatus,
			noShow: true,
		};
		updateStatusMutation.mutate(payload);
	};

	const handleClearNoShow = (attendee: AttendeeListItem) => {
		const payload: UpdateAttendeeStatusInput = {
			attendeeId: attendee.id,
			status: attendee.status,
			noShow: false,
		};
		updateStatusMutation.mutate(payload);
	};

	const handleExport = () => {
		if (!exportParams) return;
		exportMutation.mutate(exportParams);
	};

	const handleSendAnnouncement = () => {
		if (!announcementSubject.trim() || !announcementMessage.trim()) {
			toast.error("Provide a subject and message before sending");
			return;
		}
		announcementMutation.mutate({
			eventId,
			subject: announcementSubject.trim(),
			message: announcementMessage.trim(),
			audience: announcementAudience,
		});
	};

	const isUpdatingAttendee = (id: string) =>
		updateStatusMutation.isPending &&
		updateStatusMutation.variables?.attendeeId === id;

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{ label: "Events", href: "/admin/events" },
				{
					label: eventTitle,
					href: `/admin/events?highlight=${eventId}&view=table`,
				},
				{ label: "Attendees", current: true },
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />
			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="font-semibold text-2xl">{eventTitle} attendees</h1>
						<p className="text-muted-foreground text-sm">
							Monitor registrations, manage check-ins, and reach out to your
							guests.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							onClick={() => setAnnouncementOpen(true)}
							disabled={announcementMutation.isPending}
						>
							Send announcement
						</Button>
						<Button
							variant="secondary"
							onClick={handleExport}
							disabled={exportMutation.isPending || !exportParams}
						>
							Export CSV
						</Button>
					</div>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Event overview</CardTitle>
						<CardDescription>
							Snapshot of the latest schedule, status, and performance metrics.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{eventQuery.isLoading ? (
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
								{[0, 1, 2, 3].map((index) => (
									<div key={index} className="space-y-2">
										<Skeleton className="h-3 w-24" />
										<Skeleton className="h-5 w-44" />
										<Skeleton className="h-4 w-32" />
									</div>
								))}
							</div>
						) : eventQuery.isError ? (
							<Alert variant="destructive">
								<AlertTitle>Unable to load event details</AlertTitle>
								<AlertDescription>
									We couldn’t fetch the event metadata. You can still review
									attendee activity below.
								</AlertDescription>
							</Alert>
						) : eventDetail ? (
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
								<div className="space-y-1">
									<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Schedule
									</p>
									<p className="text-foreground text-sm">
										Starts: {formatDisplayDate(eventDetail.startAt) || "TBD"}
									</p>
									{eventDetail.endAt ? (
										<p className="text-muted-foreground text-sm">
											Ends: {formatDisplayDate(eventDetail.endAt)}
										</p>
									) : null}
									{eventDetail.isAllDay ? (
										<p className="text-muted-foreground text-sm">
											All-day event
										</p>
									) : null}
								</div>
								<div className="space-y-1">
									<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Location
									</p>
									<p className="text-foreground text-sm">
										{eventDetail.location ?? "No location provided"}
									</p>
									{eventDetail.url ? (
										<p className="break-all text-muted-foreground text-xs">
											{eventDetail.url}
										</p>
									) : null}
								</div>
								<div className="space-y-1">
									<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Provider
									</p>
									<p className="text-foreground text-sm">
										{eventDetail.provider?.name ?? "Unassigned"}
									</p>
									{eventDetail.provider?.category ? (
										<p className="text-muted-foreground text-sm">
											{eventDetail.provider.category}
										</p>
									) : null}
								</div>
								<div className="space-y-1">
									<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Status
									</p>
									<div className="flex flex-wrap items-center gap-2">
										{eventDetail.status ? (
											<Badge
												variant={
													statusOptionMap[
														eventDetail.status as keyof typeof statusOptionMap
													].badgeVariant
												}
											>
												{
													statusOptionMap[
														eventDetail.status as keyof typeof statusOptionMap
													].label
												}
											</Badge>
										) : null}
										<Badge
											variant={eventDetail.isPublished ? "default" : "outline"}
										>
											{eventDetail.isPublished ? "Published" : "Draft"}
										</Badge>
										{eventDetail.flag ? (
											<Badge variant="destructive">Flagged</Badge>
										) : null}
									</div>
								</div>
							</div>
						) : null}
						<EventAnalyticsSummary eventId={eventId} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Filters</CardTitle>
						<CardDescription>Search and segment the roster.</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
						<div className="flex flex-col gap-2 md:w-64">
							<Label htmlFor={searchInputId}>Search</Label>
							<Input
								id={searchInputId}
								placeholder="Name, email, or confirmation code"
								value={search}
								onChange={(event) => {
									setSearch(event.target.value);
									setPage(1);
								}}
							/>
						</div>
						<div className="flex flex-wrap gap-4">
							<div className="flex w-48 flex-col gap-2">
								<Label htmlFor={statusSelectId}>Status</Label>
								<Select
									value={statusSegment}
									onValueChange={(value: StatusSegment) => {
										setStatusSegment(value);
										setPage(1);
									}}
								>
									<SelectTrigger id={statusSelectId}>
										<SelectValue placeholder="All" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All</SelectItem>
										<SelectItem value="registered">Registered</SelectItem>
										<SelectItem value="checked_in">Checked-in</SelectItem>
										<SelectItem value="waitlisted">Waitlist</SelectItem>
										<SelectItem value="cancelled">Cancelled</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="flex w-48 flex-col gap-2">
								<Label htmlFor={checkInSelectId}>Check-in</Label>
								<Select
									value={checkInFilter}
									onValueChange={(value: CheckInFilter) => {
										setCheckInFilter(value);
										setPage(1);
									}}
								>
									<SelectTrigger id={checkInSelectId}>
										<SelectValue placeholder="All" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All attendees</SelectItem>
										<SelectItem value="checked_in">Checked-in</SelectItem>
										<SelectItem value="not_checked_in">
											Not checked-in
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="flex w-48 flex-col gap-2">
								<Label htmlFor={sortSelectId}>Sort</Label>
								<Select
									value={sort}
									onValueChange={(value) => {
										setSort(value as AttendeeListInput["sort"]);
										setPage(1);
									}}
								>
									<SelectTrigger id={sortSelectId}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="created_desc">Newest first</SelectItem>
										<SelectItem value="created_asc">Oldest first</SelectItem>
										<SelectItem value="check_in_desc">
											Recent check-ins
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="flex items-center gap-2 pt-6">
								<Checkbox
									id={noShowCheckboxId}
									checked={noShowOnly}
									onCheckedChange={(value) => {
										setNoShowOnly(Boolean(value));
										setPage(1);
									}}
								/>
								<Label htmlFor={noShowCheckboxId} className="text-sm">
									Show only no-shows
								</Label>
							</div>
						</div>
					</CardContent>
				</Card>

				{attendeesQuery.isError ? (
					<Alert variant="destructive">
						<AlertTitle>Unable to load attendees</AlertTitle>
						<AlertDescription>
							{attendeesQuery.error instanceof Error
								? attendeesQuery.error.message
								: "Something went wrong while fetching attendees."}
						</AlertDescription>
					</Alert>
				) : (
					<Card>
						<CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
							<div>
								<CardTitle>Attendee roster</CardTitle>
								<CardDescription>
									{total === 0
										? "No attendees match the current filters."
										: `Showing ${attendees.length} of ${total} attendee${total === 1 ? "" : "s"}.`}
								</CardDescription>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name &amp; contact</TableHead>
										<TableHead>Ticket</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Check-in</TableHead>
										<TableHead>No-show</TableHead>
										<TableHead>Registered</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{attendeesQuery.isLoading ? (
										skeletonRowKeys.map((key) => (
											<TableRow key={key}>
												<TableCell>
													<div className="space-y-1">
														<div className="h-4 w-36 animate-pulse rounded bg-muted" />
														<div className="h-3 w-48 animate-pulse rounded bg-muted" />
													</div>
												</TableCell>
												<TableCell>
													<div className="h-4 w-24 animate-pulse rounded bg-muted" />
												</TableCell>
												<TableCell>
													<div className="h-5 w-20 animate-pulse rounded bg-muted" />
												</TableCell>
												<TableCell>
													<div className="h-4 w-28 animate-pulse rounded bg-muted" />
												</TableCell>
												<TableCell>
													<div className="h-4 w-12 animate-pulse rounded bg-muted" />
												</TableCell>
												<TableCell>
													<div className="h-4 w-28 animate-pulse rounded bg-muted" />
												</TableCell>
												<TableCell className="text-right">
													<div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
												</TableCell>
											</TableRow>
										))
									) : attendees.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={7}
												className="text-center text-muted-foreground"
											>
												No attendees found for these filters.
											</TableCell>
										</TableRow>
									) : (
										attendees.map((attendee: AttendeeListItem) => {
											const isUpdating = isUpdatingAttendee(attendee.id);
											const checkInText = attendee.checkInAt
												? formatDistanceToNow(new Date(attendee.checkInAt), {
														addSuffix: true,
													})
												: null;
											return (
												<TableRow key={attendee.id}>
													<TableCell>
														<div className="flex flex-col">
															<span className="font-medium text-foreground">
																{attendee.name ??
																	attendee.email ??
																	"Unknown attendee"}
															</span>
															{attendee.email ? (
																<span className="text-muted-foreground text-sm">
																	{attendee.email}
																</span>
															) : null}
															{attendee.order?.confirmationCode ? (
																<span className="text-muted-foreground text-xs">
																	Order #{attendee.order.confirmationCode}
																</span>
															) : null}
														</div>
													</TableCell>
													<TableCell>
														{attendee.ticket?.name ?? "General"}
													</TableCell>
													<TableCell>
														<Badge variant={statusVariants[attendee.status]}>
															{statusLabels[attendee.status]}
														</Badge>
													</TableCell>
													<TableCell>
														{attendee.checkInAt ? (
															<div className="text-sm">
																<span className="font-medium text-foreground">
																	Checked-in
																</span>
																<p className="text-muted-foreground text-xs">
																	{checkInText}
																</p>
															</div>
														) : (
															<span className="text-muted-foreground text-sm">
																Not yet
															</span>
														)}
													</TableCell>
													<TableCell>
														{attendee.noShow ? (
															<Badge variant="destructive">No-show</Badge>
														) : (
															<Badge variant="outline">On track</Badge>
														)}
													</TableCell>
													<TableCell>
														<span className="text-muted-foreground text-sm">
															{new Date(attendee.createdAt).toLocaleString()}
														</span>
													</TableCell>
													<TableCell className="text-right">
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon"
																	disabled={isUpdating}
																>
																	<MoreHorizontal className="size-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																{attendee.status !== "checked_in" ? (
																	<DropdownMenuItem
																		onClick={() => handleCheckIn(attendee)}
																		disabled={isUpdating}
																	>
																		Mark checked-in
																	</DropdownMenuItem>
																) : (
																	<DropdownMenuItem
																		onClick={() => handleResetCheckIn(attendee)}
																		disabled={isUpdating}
																	>
																		Undo check-in
																	</DropdownMenuItem>
																)}
																<DropdownMenuItem
																	onClick={() =>
																		attendee.noShow
																			? handleClearNoShow(attendee)
																			: handleMarkNoShow(attendee)
																	}
																	disabled={isUpdating}
																>
																	{attendee.noShow
																		? "Clear no-show"
																		: "Mark no-show"}
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													</TableCell>
												</TableRow>
											);
										})
									)}
								</TableBody>
							</Table>
							{total > 0 ? (
								<div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
									<p className="text-muted-foreground text-sm">
										Page {page} of {totalPages}
									</p>
									<Pagination>
										<PaginationContent>
											<PaginationItem>
												<PaginationPrevious
													href="#"
													onClick={(event) => {
														event.preventDefault();
														setPage((prev) => Math.max(1, prev - 1));
													}}
													aria-disabled={page === 1}
													className={
														page === 1
															? "pointer-events-none opacity-50"
															: undefined
													}
												/>
											</PaginationItem>
											<PaginationItem>
												<PaginationLink href="#" isActive>
													{page}
												</PaginationLink>
											</PaginationItem>
											<PaginationItem>
												<PaginationNext
													href="#"
													onClick={(event) => {
														event.preventDefault();
														setPage((prev) => Math.min(totalPages, prev + 1));
													}}
													aria-disabled={page >= totalPages}
													className={
														page >= totalPages
															? "pointer-events-none opacity-50"
															: undefined
													}
												/>
											</PaginationItem>
										</PaginationContent>
									</Pagination>
								</div>
							) : null}
						</CardContent>
					</Card>
				)}
			</div>

			<Dialog open={isAnnouncementOpen} onOpenChange={setAnnouncementOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Send announcement</DialogTitle>
						<DialogDescription>
							Email registrants with important updates before or during the
							event.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<Label htmlFor={audienceSelectId}>Audience</Label>
							<Select
								value={announcementAudience}
								onValueChange={(value) =>
									setAnnouncementAudience(
										value as BulkAnnouncementInput["audience"],
									)
								}
							>
								<SelectTrigger id={audienceSelectId}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All registrants</SelectItem>
									<SelectItem value="registered">
										Registered (not checked-in)
									</SelectItem>
									<SelectItem value="checked_in">Checked-in only</SelectItem>
									<SelectItem value="not_checked_in">
										Not yet checked-in
									</SelectItem>
									<SelectItem value="waitlist">Waitlist</SelectItem>
									<SelectItem value="no_show">Marked no-show</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor={subjectInputId}>Subject</Label>
							<Input
								id={subjectInputId}
								value={announcementSubject}
								onChange={(event) => setAnnouncementSubject(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={messageTextareaId}>Message</Label>
							<textarea
								id={messageTextareaId}
								className={textareaStyles}
								value={announcementMessage}
								onChange={(event) => setAnnouncementMessage(event.target.value)}
								placeholder="Share schedule changes, arrival details, or onsite reminders."
							/>
						</div>
					</div>
					<DialogFooter className="gap-2">
						<Button
							variant="outline"
							onClick={() => setAnnouncementOpen(false)}
							disabled={announcementMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleSendAnnouncement}
							disabled={announcementMutation.isPending}
						>
							{announcementMutation.isPending
								? "Sending…"
								: "Send announcement"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</AppShell>
	);
}
