"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { CalendarDays, LayoutGrid, Table as TableIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EventDetailSheet } from "@/components/admin/events/EventDetailSheet";
import {
	EventEditDialog,
	type EventEditFormValues,
	type ProviderOption,
} from "@/components/admin/events/EventEditDialog";
import { EventListView } from "@/components/admin/events/EventListView";
import type { StatusAction } from "@/components/admin/events/status-actions";
import { statusActions } from "@/components/admin/events/status-actions";
import type {
	EventListItem,
	EventsListOutput,
} from "@/components/admin/events/types";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { providerKeys } from "@/lib/query-keys/providers";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

import {
	type EventStatus,
	type EventsListFilters,
	eventStatuses,
	statusOptionMap,
} from "./event-filters";
import { useEventFilters } from "./useEventFilters";

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

const DEFAULT_PAGE_SIZE = 25;

type UpdateStatusInput = RouterInputs["events"]["updateStatus"];
type BulkUpdateStatusInput = RouterInputs["events"]["bulkUpdateStatus"];
type UpdateEventInput = RouterInputs["events"]["update"];
type ProvidersCatalogListOutput = RouterOutputs["providers"]["catalog"]["list"];

const adminEventKeys = {
	all: ["adminEvents"] as const,
	list: (params: {
		filters: EventsListFilters | null;
		page: number;
		limit: number;
	}) => [...adminEventKeys.all, "list", params] as const,
} as const;

function patchEventsInCache(
	queryClient: QueryClient,
	queryKey: ReturnType<typeof adminEventKeys.list>,
	ids: Iterable<string>,
	patch: Partial<EventListItem>,
) {
	const idSet = new Set(ids);
	queryClient.setQueryData<EventsListOutput>(
		queryKey,
		(previous: EventsListOutput | undefined) => {
			if (!previous) return previous;
			return {
				...previous,
				items: previous.items.map((item: EventListItem) =>
					idSet.has(item.id) ? { ...item, ...patch } : item,
				),
			} satisfies EventsListOutput;
		},
	);
}

function replaceEventInCache(
	queryClient: QueryClient,
	queryKey: ReturnType<typeof adminEventKeys.list>,
	updated: EventListItem,
) {
	queryClient.setQueryData<EventsListOutput>(
		queryKey,
		(previous: EventsListOutput | undefined) => {
			if (!previous) return previous;
			return {
				...previous,
				items: previous.items.map((item: EventListItem) =>
					item.id === updated.id ? updated : item,
				),
			} satisfies EventsListOutput;
		},
	);
}

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

	const providersQuery = useQuery<ProvidersCatalogListOutput>({
		queryKey: providerKeys.catalog.list(),
		queryFn: () => trpcClient.providers.catalog.list.query(),
	});

	const providerOptions = useMemo<ProviderOption[]>(() => {
		if (!providersQuery.data) return [];
		return providersQuery.data.map(
			(provider: ProvidersCatalogListOutput[number]) =>
				({
					id: provider.id,
					name: provider.name,
				}) satisfies ProviderOption,
		);
	}, [providersQuery.data]);

	const listQueryKey = useMemo<ReturnType<typeof adminEventKeys.list>>(
		() => adminEventKeys.list({ filters: listFilters ?? null, page, limit }),
		[limit, listFilters, page],
	);

	const eventsQuery = useQuery<EventsListOutput>({
		queryKey: listQueryKey,
		queryFn: () => trpcClient.events.list.query(listParams),
		placeholderData: (previous: EventsListOutput | undefined) => previous,
	});

	const events = useMemo<EventListItem[]>(
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

	const [selectedIds, setSelectedIds] = useState<
		Array<EventsListOutput["items"][number]["id"]>
	>([]);

	useEffect(() => {
		setPage(1);
		setSelectedIds([]);
		void listFilters;
	}, [listFilters, setPage]);

	const eventIdSet = useMemo(
		() => new Set(events.map((event: EventListItem) => event.id)),
		[events],
	);

	useEffect(() => {
		setSelectedIds((prev) => {
			const filtered = prev.filter((id) => eventIdSet.has(id));
			return filtered.length === prev.length ? prev : filtered;
		});
	}, [eventIdSet]);

	const [detailId, setDetailId] = useState<string | null>(null);
	const [editingEvent, setEditingEvent] = useState<EventListItem | null>(null);

	const detailEvent = useMemo(
		() => events.find((event: EventListItem) => event.id === detailId) ?? null,
		[detailId, events],
	);

	const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const allSelectedOnPage =
		events.length > 0 &&
		events.every((event: EventListItem) => selectedIdSet.has(event.id));

	const handleSelectAll = useCallback(
		(checked: boolean) => {
			setSelectedIds((prev) => {
				if (checked) {
					const union = new Set(prev);
					events.forEach((event: EventListItem) => {
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
		setEditingEvent(event);
	}, []);

	const handleEditClose = useCallback(() => {
		setEditingEvent(null);
	}, []);

	const updateStatusMutation = useMutation({
		mutationFn: (variables: UpdateStatusInput) =>
			trpcClient.events.updateStatus.mutate(variables),
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey: listQueryKey });
			const previous = queryClient.getQueryData<EventsListOutput>(listQueryKey);
			patchEventsInCache(queryClient, listQueryKey, [variables.id], {
				status: variables.status,
				updatedAt: new Date().toISOString(),
			});
			return { previous };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData<EventsListOutput>(
					listQueryKey,
					context.previous,
				);
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
				updatedAt: new Date().toISOString(),
			});
			return { previous, ids: variables.ids };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData<EventsListOutput>(
					listQueryKey,
					context.previous,
				);
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
				updatedAt: new Date().toISOString(),
				...(variables.title !== undefined ? { title: variables.title } : {}),
				...(variables.description !== undefined
					? {
							description:
								typeof variables.description === "string"
									? variables.description
									: (variables.description ?? null),
						}
					: {}),
				...(variables.location !== undefined
					? {
							location:
								typeof variables.location === "string"
									? variables.location
									: (variables.location ?? null),
						}
					: {}),
				...(variables.url !== undefined
					? {
							url:
								typeof variables.url === "string"
									? variables.url
									: (variables.url ?? null),
						}
					: {}),
				...(variables.startAt !== undefined
					? { startAt: variables.startAt }
					: {}),
				...(variables.endAt !== undefined ? { endAt: variables.endAt } : {}),
				...(variables.isAllDay !== undefined
					? { isAllDay: variables.isAllDay }
					: {}),
				...(variables.isPublished !== undefined
					? { isPublished: variables.isPublished }
					: {}),
				...(variables.externalId !== undefined
					? { externalId: variables.externalId ?? null }
					: {}),
				...(variables.priority !== undefined
					? { priority: variables.priority }
					: {}),
			};
			patchEventsInCache(queryClient, listQueryKey, [variables.id], patch);
			return { previous };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData<EventsListOutput>(
					listQueryKey,
					context.previous,
				);
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
		(values: EventEditFormValues) => {
			if (!editingEvent) return;

			const payload: RouterInputs["events"]["update"] = {
				id: editingEvent.id,
				title: values.title.trim(),
				description: values.description.trim(),
				location: values.location.trim(),
				url: values.url.trim() || null,
				startAt: values.startAt
					? new Date(values.startAt).toISOString()
					: undefined,
				endAt: values.endAt ? new Date(values.endAt).toISOString() : null,
				isAllDay: values.isAllDay,
				isPublished: values.isPublished,
				externalId: values.externalId.trim(),
				priority: values.priority,
				providerId: values.providerId || undefined,
			};

			updateEventMutation.mutate(payload);
		},
		[editingEvent, updateEventMutation],
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
								variant={filters.view === "card" ? "default" : "outline"}
								size="icon"
								aria-label="Card view"
								onClick={() => handleViewChange("card")}
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
										{eventStatuses.map((status: EventStatus) => (
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
										{providersQuery.data?.map(
											(provider: ProvidersCatalogListOutput[number]) => (
												<SelectItem key={provider.id} value={provider.id}>
													{provider.name}
												</SelectItem>
											),
										)}
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
											{[1, 2, 3, 4, 5].map((priority: number) => (
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
											{[1, 2, 3, 4, 5].map((priority: number) => (
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
							{statusActions.map((action: StatusAction) => (
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
				)}

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

			<EventDetailSheet
				event={detailEvent}
				statusActions={statusActions}
				onUpdateStatus={handleStatusAction}
				onEdit={handleEditOpen}
				onClose={handleCloseDetail}
				statusLoading={statusLoading}
			/>

			<EventEditDialog
				open={editingEvent != null}
				event={editingEvent}
				providers={providerOptions}
				onSubmit={handleEditSubmit}
				onClose={handleEditClose}
				isSaving={updateEventMutation.isPending}
			/>
		</AppShell>
	);
}
