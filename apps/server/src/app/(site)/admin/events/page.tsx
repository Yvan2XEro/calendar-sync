"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { inferRouterInputs } from "@trpc/server";
import { format } from "date-fns";
import { CalendarDays, LayoutGrid, Table as TableIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EventListView } from "@/components/admin/events/EventListView";
import { statusActions } from "@/components/admin/events/status-actions";
import type { EventListItem, EventsListOutput } from "@/components/admin/events/types";
import { formatDisplayDate } from "@/components/admin/events/utils";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
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
        DialogClose,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogHeader,
        DialogTitle,
} from "@/components/ui/dialog";
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
import {
        Sheet,
        SheetContent,
        SheetDescription,
        SheetHeader,
        SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { providerKeys } from "@/lib/query-keys/providers";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

import {
        type EventStatus,
        eventStatuses,
        statusOptionMap,
} from "./event-filters";
import { useEventFilters } from "./useEventFilters";

type RouterInputs = inferRouterInputs<AppRouter>;

const DEFAULT_PAGE_SIZE = 25;

type EventsListInput = RouterInputs["events"]["list"];
type EventsListFilters = Omit<NonNullable<EventsListInput>, "page" | "limit">;
type UpdateStatusInput = RouterInputs["events"]["updateStatus"];
type BulkUpdateStatusInput = RouterInputs["events"]["bulkUpdateStatus"];
type UpdateEventInput = RouterInputs["events"]["update"];

const adminEventKeys = {
	all: ["adminEvents"] as const,
	list: (params: {
		filters: EventsListFilters | null;
		page: number;
		limit: number;
	}) => [...adminEventKeys.all, "list", params] as const,
} as const;

function formatDateTimeLocal(value: string | Date | null | undefined) {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return format(date, "yyyy-MM-dd'T'HH:mm");
}

function patchEventsInCache(
        queryClient: QueryClient,
        queryKey: unknown,
        ids: Iterable<string>,
	patch: Partial<EventListItem>,
) {
	const idSet = new Set(ids);
	queryClient.setQueryData<EventsListOutput>(queryKey, (previous) => {
		if (!previous) return previous;
		return {
			...previous,
			items: previous.items.map((item) =>
				idSet.has(item.id) ? { ...item, ...patch } : item,
			),
		} satisfies EventsListOutput;
	});
}

function replaceEventInCache(
	queryClient: QueryClient,
	queryKey: unknown,
	updated: EventListItem,
) {
	queryClient.setQueryData<EventsListOutput>(queryKey, (previous) => {
		if (!previous) return previous;
		return {
			...previous,
			items: previous.items.map((item) =>
				item.id === updated.id ? updated : item,
			),
		} satisfies EventsListOutput;
	});
}

type EditValues = {
	title: string;
	description: string;
	location: string;
	url: string;
	startAt: string;
	endAt: string;
	isAllDay: boolean;
	isPublished: boolean;
	externalId: string;
	priority: number;
	providerId: string;
};

export default function AdminEventsPage() {
	const queryClient = useQueryClient();
	const {
		filters,
		listFilters,
		listParams,
		page,
		setPage,
		limit,
		setLimit,
		handleSearchChange,
		handleStatusChange,
		handleProviderChange,
		handleDateChange,
		handleToggleChange,
		handlePriorityChange,
		handleViewChange,
	} = useEventFilters({ defaultLimit: DEFAULT_PAGE_SIZE });

	const providersQuery = useQuery({
		queryKey: providerKeys.catalog.list(),
		queryFn: () => trpcClient.providers.catalog.list.query(),
	});

	const listQueryKey = useMemo(
		() => adminEventKeys.list({ filters: listFilters ?? null, page, limit }),
		[limit, listFilters, page],
	);

	const eventsQuery = useQuery({
		queryKey: listQueryKey,
		queryFn: () => trpcClient.events.list.query(listParams),
		keepPreviousData: true,
	});

	const events = useMemo(
		() => eventsQuery.data?.items ?? [],
		[eventsQuery.data?.items],
	);
	const total = eventsQuery.data?.total ?? 0;
	const currentPage = eventsQuery.data?.page ?? page;
	const currentLimit = eventsQuery.data?.limit ?? limit;
	const safeLimit = currentLimit > 0 ? currentLimit : DEFAULT_PAGE_SIZE;
	const totalPages = total > 0 ? Math.max(1, Math.ceil(total / safeLimit)) : 1;
	const summaryStart =
		total === 0 || events.length === 0 ? 0 : (currentPage - 1) * safeLimit + 1;
	const summaryEnd =
		total === 0 || events.length === 0
			? 0
			: Math.min(total, summaryStart + events.length - 1);

        useEffect(() => {
                if (!eventsQuery.data) return;
                if (eventsQuery.data.limit !== limit) {
                        setLimit(eventsQuery.data.limit);
                }
        }, [eventsQuery.data, limit, setLimit]);

	const [selectedIds, setSelectedIds] = useState<string[]>([]);

        useEffect(() => {
                setPage(1);
                setSelectedIds([]);
                void listFilters;
        }, [listFilters, setPage, setSelectedIds]);

	const eventIdSet = useMemo(
		() => new Set(events.map((event) => event.id)),
		[events],
	);

	useEffect(() => {
		setSelectedIds((prev) => {
			const filtered = prev.filter((id) => eventIdSet.has(id));
			return filtered.length === prev.length ? prev : filtered;
		});
	}, [eventIdSet]);

	const [detailId, setDetailId] = useState<string | null>(null);
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValues, setEditValues] = useState<EditValues | null>(null);

	const detailEvent = useMemo(
		() => events.find((event) => event.id === detailId) ?? null,
		[detailId, events],
	);

	const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const allSelectedOnPage =
		events.length > 0 && events.every((event) => selectedIdSet.has(event.id));

	const handleSelectAll = useCallback(
		(checked: boolean) => {
			setSelectedIds((prev) => {
				if (checked) {
                                        const union = new Set(prev);
                                        events.forEach((event) => {
                                                union.add(event.id);
                                        });
					return Array.from(union);
				}
				return prev.filter((id) => !eventIdSet.has(id));
			});
		},
		[eventIdSet, events],
	);

	const handleSelect = useCallback((id: string, checked: boolean) => {
		setSelectedIds((prev) => {
			if (checked) {
				if (prev.includes(id)) return prev;
				return [...prev, id];
			}
			return prev.filter((value) => value !== id);
		});
	}, []);

	const handleOpenDetail = useCallback((id: string) => {
		setDetailId(id);
	}, []);

	const handleCloseDetail = useCallback(() => {
		setDetailId(null);
	}, []);

	const handleEditOpen = useCallback((event: EventListItem) => {
		setEditingId(event.id);
		setEditValues({
			title: event.title,
			description: event.description ?? "",
			location: event.location ?? "",
			url: event.url ?? "",
			startAt: formatDateTimeLocal(event.startAt),
			endAt: formatDateTimeLocal(event.endAt),
			isAllDay: event.isAllDay,
			isPublished: event.isPublished,
			externalId: event.externalId ?? "",
			priority: event.priority,
			providerId: event.provider?.id ?? "",
		});
		setEditDialogOpen(true);
	}, []);

	const handleEditClose = useCallback(() => {
		setEditDialogOpen(false);
		setEditingId(null);
		setEditValues(null);
	}, []);

	const updateStatusMutation = useMutation({
		mutationFn: (variables: UpdateStatusInput) =>
			trpcClient.events.updateStatus.mutate(variables),
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey: listQueryKey });
			const previous = queryClient.getQueryData<EventsListOutput>(listQueryKey);
			patchEventsInCache(queryClient, listQueryKey, [variables.id], {
				status: variables.status,
				updatedAt: new Date().toISOString() as unknown as Date,
			});
			return { previous };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(listQueryKey, context.previous);
			}
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to update event status",
			);
		},
		onSuccess: (updated, variables) => {
			replaceEventInCache(queryClient, listQueryKey, updated);
			const statusLabel = statusOptionMap[variables.status]?.label ?? "Status";
			toast.success(`${statusLabel} applied`);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: listQueryKey });
		},
	});

	const bulkStatusMutation = useMutation({
		mutationFn: (variables: BulkUpdateStatusInput) =>
			trpcClient.events.bulkUpdateStatus.mutate(variables),
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey: listQueryKey });
			const previous = queryClient.getQueryData<EventsListOutput>(listQueryKey);
			patchEventsInCache(queryClient, listQueryKey, variables.ids, {
				status: variables.status,
				updatedAt: new Date().toISOString() as unknown as Date,
			});
			return { previous, ids: variables.ids };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(listQueryKey, context.previous);
			}
			toast.error(
				error instanceof Error ? error.message : "Unable to update events",
			);
		},
		onSuccess: (result, variables) => {
			toast.success(
				result.updatedCount === variables.ids.length
					? `${result.updatedCount} events updated`
					: `${result.updatedCount} of ${variables.ids.length} events updated`,
			);
			setSelectedIds((prev) =>
				prev.filter((id) => !variables.ids.includes(id)),
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: listQueryKey });
		},
	});

	const updateEventMutation = useMutation({
		mutationFn: (variables: UpdateEventInput) =>
			trpcClient.events.update.mutate(variables),
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey: listQueryKey });
			const previous = queryClient.getQueryData<EventsListOutput>(listQueryKey);
			const patch: Partial<EventListItem> = {
				updatedAt: new Date().toISOString() as unknown as Date,
			};
			if (variables.title !== undefined) patch.title = variables.title;
			if (variables.description !== undefined)
				patch.description =
					typeof variables.description === "string"
						? variables.description
						: (variables.description ?? null);
			if (variables.location !== undefined)
				patch.location =
					typeof variables.location === "string"
						? variables.location
						: (variables.location ?? null);
			if (variables.url !== undefined)
				patch.url =
					typeof variables.url === "string"
						? variables.url
						: (variables.url ?? null);
			if (variables.startAt !== undefined) patch.startAt = variables.startAt;
			if (variables.endAt !== undefined) patch.endAt = variables.endAt;
			if (variables.isAllDay !== undefined) patch.isAllDay = variables.isAllDay;
			if (variables.isPublished !== undefined)
				patch.isPublished = variables.isPublished;
			if (variables.externalId !== undefined)
				patch.externalId = variables.externalId ?? null;
			if (variables.priority !== undefined) patch.priority = variables.priority;
			patchEventsInCache(queryClient, listQueryKey, [variables.id], patch);
			return { previous };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(listQueryKey, context.previous);
			}
			toast.error(
				error instanceof Error ? error.message : "Unable to update event",
			);
		},
		onSuccess: (updated) => {
			replaceEventInCache(queryClient, listQueryKey, updated);
			toast.success("Event updated");
			handleEditClose();
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: listQueryKey });
		},
	});

	const handleStatusAction = useCallback(
		(eventId: string, status: EventStatus) => {
			updateStatusMutation.mutate({ id: eventId, status });
		},
		[updateStatusMutation],
	);

	const handleBulkStatus = useCallback(
		(status: EventStatus) => {
			if (!selectedIds.length) return;
			bulkStatusMutation.mutate({ ids: selectedIds, status });
		},
		[bulkStatusMutation, selectedIds],
	);

	const handleEditSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (!editingId || !editValues) return;

			const payload: RouterInputs["events"]["update"] = {
				id: editingId,
				title: editValues.title.trim(),
				description: editValues.description.trim(),
				location: editValues.location.trim(),
				url: editValues.url.trim() || null,
				startAt: editValues.startAt
					? new Date(editValues.startAt).toISOString()
					: undefined,
				endAt: editValues.endAt
					? new Date(editValues.endAt).toISOString()
					: null,
				isAllDay: editValues.isAllDay,
				isPublished: editValues.isPublished,
				externalId: editValues.externalId.trim(),
				priority: editValues.priority,
				providerId: editValues.providerId || undefined,
			};

			updateEventMutation.mutate(payload);
		},
		[editValues, editingId, updateEventMutation],
	);

	const headerCheckboxState = selectedIds.length
		? allSelectedOnPage
			? true
			: "indeterminate"
		: false;

	const statusLoading =
		updateStatusMutation.isPending || bulkStatusMutation.isPending;

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{ label: "Events", current: true },
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />
			<section className="space-y-6">
				<Card>
					<CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="font-semibold text-2xl">
								Event moderation
							</CardTitle>
							<CardDescription>
								Review synchronized events, adjust metadata, and update their
								publication state.
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant={filters.view === "table" ? "default" : "outline"}
								size="icon"
								aria-label="Table view"
								onClick={() => handleViewChange("table")}
							>
								<TableIcon className="size-4" />
							</Button>
							<Button
								variant={filters.view === "cards" ? "default" : "outline"}
								size="icon"
								aria-label="Card view"
								onClick={() => handleViewChange("cards")}
							>
								<LayoutGrid className="size-4" />
							</Button>
						</div>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
							<div className="flex flex-1 items-center gap-3">
								<div className="relative min-w-0 flex-1">
									<Input
										value={filters.q}
										onChange={handleSearchChange}
										placeholder="Search by title, description, or location"
										aria-label="Search events"
									/>
								</div>
								<Select
									value={filters.status}
									onValueChange={handleStatusChange}
								>
									<SelectTrigger className="w-[180px]">
										<SelectValue placeholder="Status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">
											{statusOptionMap.all.label}
										</SelectItem>
										{eventStatuses.map((status) => (
											<SelectItem key={status} value={status}>
												{statusOptionMap[status].label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Select
									value={filters.providerId || "all"}
									onValueChange={handleProviderChange}
								>
									<SelectTrigger className="w-[200px]">
										<SelectValue placeholder="Provider" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All providers</SelectItem>
										{providersQuery.data?.map((provider) => (
											<SelectItem key={provider.id} value={provider.id}>
												{provider.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
							<div className="flex flex-col gap-2">
								<Label htmlFor="events-start">Start from</Label>
								<Input
									id="events-start"
									type="date"
									value={filters.startFrom}
									onChange={handleDateChange("startFrom")}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="events-end">Start to</Label>
								<Input
									id="events-end"
									type="date"
									value={filters.startTo}
									onChange={handleDateChange("startTo")}
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
								<div>
									<Label
										htmlFor="events-published"
										className="font-medium text-sm"
									>
										Published only
									</Label>
									<p className="text-muted-foreground text-xs">
										Show only events visible to attendees
									</p>
								</div>
								<Switch
									id="events-published"
									checked={filters.publishedOnly}
									onCheckedChange={handleToggleChange("publishedOnly")}
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
								<div>
									<Label
										htmlFor="events-allday"
										className="font-medium text-sm"
									>
										All-day events
									</Label>
									<p className="text-muted-foreground text-xs">
										Filter to events marked as all-day
									</p>
								</div>
								<Switch
									id="events-allday"
									checked={filters.allDayOnly}
									onCheckedChange={handleToggleChange("allDayOnly")}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label>Priority range</Label>
								<div className="flex items-center gap-2">
									<Select
										value={
											filters.priorityMin !== null
												? String(filters.priorityMin)
												: "any"
										}
										onValueChange={(value) =>
											handlePriorityChange("priorityMin", value)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Min" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="any">Any</SelectItem>
											{[1, 2, 3, 4, 5].map((priority) => (
												<SelectItem
													key={`min-${priority}`}
													value={String(priority)}
												>
													{priority}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<span className="text-muted-foreground text-sm">to</span>
									<Select
										value={
											filters.priorityMax !== null
												? String(filters.priorityMax)
												: "any"
										}
										onValueChange={(value) =>
											handlePriorityChange("priorityMax", value)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Max" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="any">Any</SelectItem>
											{[1, 2, 3, 4, 5].map((priority) => (
												<SelectItem
													key={`max-${priority}`}
													value={String(priority)}
												>
													{priority}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{selectedIds.length > 0 ? (
					<div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 md:flex-row md:items-center md:justify-between">
						<div className="flex items-center gap-2 text-sm">
							<Checkbox
								checked={headerCheckboxState}
								onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
							/>
							<span>
								{selectedIds.length} event
								{selectedIds.length === 1 ? "" : "s"} selected
							</span>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{statusActions.map((action) => (
								<Button
									key={action.status}
									size="sm"
									variant="outline"
									onClick={() => handleBulkStatus(action.status)}
									disabled={bulkStatusMutation.isPending}
								>
									<action.icon className="mr-2 size-4" />
									{action.label}
								</Button>
							))}
						</div>
					</div>
				) : null}

				{eventsQuery.isLoading ? (
					<div className="grid gap-4">
						<Card>
							<CardContent className="space-y-3 py-6">
								<div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
								<div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
								<div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
							</CardContent>
						</Card>
					</div>
				) : events.length === 0 ? (
					<Card className="border-dashed">
						<CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
							<CalendarDays className="size-10 text-muted-foreground" />
							<div>
								<p className="font-medium text-lg">
									No events match your filters
								</p>
								<p className="text-muted-foreground text-sm">
									Adjust the filters above to explore synchronized events.
								</p>
							</div>
						</CardContent>
					</Card>
				) : (
                                <EventListView
                                        events={events}
                                        view={filters.view}
                                        selectedIds={selectedIds}
                                        onSelect={handleSelect}
                                        onSelectAll={handleSelectAll}
                                        onEdit={handleEditOpen}
                                        onViewDetail={handleOpenDetail}
                                        onStatusAction={handleStatusAction}
                                />
                                )

				{eventsQuery.data && total > 0 ? (
					<div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="text-muted-foreground text-sm">
							Showing {summaryStart} to {summaryEnd} of {total} events
						</div>
						<Pagination>
							<PaginationContent className="flex-wrap gap-1">
								<PaginationItem>
									<PaginationPrevious
										href="#"
										onClick={(event) => {
											event.preventDefault();
											setPage((prev) => Math.max(1, prev - 1));
										}}
										aria-disabled={page === 1}
										className={
											page === 1 ? "pointer-events-none opacity-50" : undefined
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
			</section>

			<Sheet
				open={detailEvent != null}
				onOpenChange={(open) => {
					if (!open) handleCloseDetail();
				}}
			>
				<SheetContent
					side="right"
					className="min-w-2xl max-w-2xl overflow-y-auto p-3"
				>
					<SheetHeader>
						<SheetTitle>{detailEvent?.title ?? "Event details"}</SheetTitle>
						<SheetDescription>
							Review the synchronized metadata before applying moderation
							changes.
						</SheetDescription>
					</SheetHeader>
					{detailEvent ? (
						<div className="mt-6 space-y-6">
							<div className="space-y-2">
								<p className="text-muted-foreground text-sm">
									Event ID: {detailEvent.id}
								</p>
								{detailEvent.externalId ? (
									<p className="text-muted-foreground text-sm">
										External ID: {detailEvent.externalId}
									</p>
								) : null}
								<div className="flex flex-wrap gap-2">
									<Badge
										variant={statusOptionMap[detailEvent.status].badgeVariant}
									>
										{statusOptionMap[detailEvent.status].label}
									</Badge>
									<Badge
										variant={detailEvent.isPublished ? "default" : "outline"}
									>
										{detailEvent.isPublished ? "Published" : "Draft"}
									</Badge>
									{detailEvent.isAllDay ? (
										<Badge variant="outline">All-day</Badge>
									) : null}
								</div>
							</div>
							<div className="space-y-1 text-sm">
								<p className="font-semibold text-foreground">Schedule</p>
								<p className="text-muted-foreground">
									Starts: {formatDisplayDate(detailEvent.startAt)}
								</p>
								{detailEvent.endAt ? (
									<p className="text-muted-foreground">
										Ends: {formatDisplayDate(detailEvent.endAt)}
									</p>
								) : null}
							</div>
							<div className="space-y-1 text-sm">
								<p className="font-semibold text-foreground">Location</p>
								<p className="text-muted-foreground">
									{detailEvent.location ?? "No location provided"}
								</p>
							</div>
							<div className="space-y-1 text-sm">
								<p className="font-semibold text-foreground">Provider</p>
								<p className="text-muted-foreground">
									{detailEvent.provider?.name ?? "Unassigned"}
								</p>
								{detailEvent.provider?.category ? (
									<p className="text-muted-foreground">
										{detailEvent.provider.category}
									</p>
								) : null}
							</div>
							{detailEvent.description ? (
								<div className="space-y-1 text-sm">
									<p className="font-semibold text-foreground">Description</p>
									<p className="whitespace-pre-wrap text-muted-foreground">
										{detailEvent.description}
									</p>
								</div>
							) : null}
							<div className="space-y-1 text-sm">
								<p className="font-semibold text-foreground">Metadata</p>
								<pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-3 text-xs">
									{JSON.stringify(detailEvent.metadata ?? {}, null, 2)}
								</pre>
							</div>
							<div className="flex flex-wrap gap-2">
								{statusActions.map((action) => (
									<Button
										key={action.status}
										onClick={() =>
											handleStatusAction(detailEvent.id, action.status)
										}
										disabled={statusLoading}
									>
										<action.icon className="mr-2 size-4" />
										{action.label}
									</Button>
								))}
								<Button
									variant="outline"
									onClick={() => handleEditOpen(detailEvent)}
								>
									Edit event
								</Button>
							</div>
						</div>
					) : null}
				</SheetContent>
			</Sheet>

			<Dialog
				open={editDialogOpen}
				onOpenChange={(open) => {
					if (!open) handleEditClose();
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<form onSubmit={handleEditSubmit} className="space-y-4">
						<DialogHeader>
							<DialogTitle>Edit event</DialogTitle>
							<DialogDescription>
								Update key event metadata before saving your moderation changes.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="event-title">Title</Label>
							<Input
								id="event-title"
								value={editValues?.title ?? ""}
								onChange={(event) =>
									setEditValues((prev) =>
										prev ? { ...prev, title: event.target.value } : prev,
									)
								}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="event-description">Description</Label>
							<textarea
								id="event-description"
								value={editValues?.description ?? ""}
								onChange={(event) =>
									setEditValues((prev) =>
										prev
											? {
													...prev,
													description: event.target.value,
												}
											: prev,
									)
								}
								className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							/>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="event-start">Start time</Label>
								<Input
									id="event-start"
									type="datetime-local"
									value={editValues?.startAt ?? ""}
									onChange={(event) =>
										setEditValues((prev) =>
											prev
												? {
														...prev,
														startAt: event.target.value,
													}
												: prev,
										)
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="event-end">End time</Label>
								<Input
									id="event-end"
									type="datetime-local"
									value={editValues?.endAt ?? ""}
									onChange={(event) =>
										setEditValues((prev) =>
											prev
												? {
														...prev,
														endAt: event.target.value,
													}
												: prev,
										)
									}
								/>
							</div>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="event-location">Location</Label>
								<Input
									id="event-location"
									value={editValues?.location ?? ""}
									onChange={(event) =>
										setEditValues((prev) =>
											prev
												? {
														...prev,
														location: event.target.value,
													}
												: prev,
										)
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="event-url">URL</Label>
								<Input
									id="event-url"
									value={editValues?.url ?? ""}
									onChange={(event) =>
										setEditValues((prev) =>
											prev
												? {
														...prev,
														url: event.target.value,
													}
												: prev,
										)
									}
								/>
							</div>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="event-priority">Priority</Label>
								<Select
									value={editValues ? String(editValues.priority) : "3"}
									onValueChange={(value) =>
										setEditValues((prev) =>
											prev
												? {
														...prev,
														priority: Number(value),
													}
												: prev,
										)
									}
								>
									<SelectTrigger id="event-priority">
										<SelectValue placeholder="Priority" />
									</SelectTrigger>
									<SelectContent>
										{[1, 2, 3, 4, 5].map((priority) => (
											<SelectItem key={priority} value={String(priority)}>
												{priority}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="event-provider">Provider</Label>
								<Select
									value={editValues?.providerId ?? ""}
									onValueChange={(value) =>
										setEditValues((prev) =>
											prev
												? {
														...prev,
														providerId: value,
													}
												: prev,
										)
									}
								>
									<SelectTrigger id="event-provider">
										<SelectValue placeholder="Select provider" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="">Unassigned</SelectItem>
										{providersQuery.data?.map((provider) => (
											<SelectItem key={provider.id} value={provider.id}>
												{provider.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="event-external">External ID</Label>
								<Input
									id="event-external"
									value={editValues?.externalId ?? ""}
									onChange={(event) =>
										setEditValues((prev) =>
											prev
												? {
														...prev,
														externalId: event.target.value,
													}
												: prev,
										)
									}
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
								<div>
									<Label
										htmlFor="event-published"
										className="font-medium text-sm"
									>
										Published
									</Label>
									<p className="text-muted-foreground text-xs">
										Toggle whether the event is visible externally.
									</p>
								</div>
								<Switch
									id="event-published"
									checked={editValues?.isPublished ?? false}
									onCheckedChange={(checked) =>
										setEditValues((prev) =>
											prev ? { ...prev, isPublished: checked } : prev,
										)
									}
								/>
							</div>
						</div>
						<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
							<div>
								<Label htmlFor="event-allday" className="font-medium text-sm">
									All-day event
								</Label>
								<p className="text-muted-foreground text-xs">
									Set to true if this event spans the entire day.
								</p>
							</div>
							<Switch
								id="event-allday"
								checked={editValues?.isAllDay ?? false}
								onCheckedChange={(checked) =>
									setEditValues((prev) =>
										prev ? { ...prev, isAllDay: checked } : prev,
									)
								}
							/>
						</div>
						<DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
							<DialogClose asChild>
								<Button type="button" variant="outline">
									Cancel
								</Button>
							</DialogClose>
							<Button type="submit" disabled={updateEventMutation.isPending}>
								{updateEventMutation.isPending ? "Saving…" : "Save changes"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</AppShell>
	);
}
