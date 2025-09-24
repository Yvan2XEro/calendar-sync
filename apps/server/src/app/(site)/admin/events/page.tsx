"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import {
        type InfiniteData,
        type QueryClient,
        useInfiniteQuery,
        useMutation,
        useQuery,
        useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
        Calendar,
        CalendarClock,
        CalendarDays,
        Clock,
        ExternalLink,
        LayoutGrid,
        MapPin,
        MoreHorizontal,
        RefreshCcw,
        Table as TableIcon,
        Tag,
        UserCheck,
        UserX,
} from "lucide-react";
import type {
        ChangeEvent,
        ComponentType,
        FormEvent,
        SVGProps,
} from "react";
import {
        useCallback,
        useEffect,
        useMemo,
        useRef,
        useState,
} from "react";
import {
        usePathname,
        useRouter,
        useSearchParams,
} from "next/navigation";
import { toast } from "sonner";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

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
import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
        Table,
        TableBody,
        TableCell,
        TableHead,
        TableHeader,
        TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { providerKeys } from "@/lib/query-keys/providers";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

const EVENT_FILTER_STORAGE_KEY = "admin.events.filters";

const eventStatuses = ["pending", "approved", "rejected"] as const;
type EventStatus = (typeof eventStatuses)[number];

const statusOptionMap: Record<
        "all" | EventStatus,
        { label: string; badgeVariant: "default" | "secondary" | "outline" }
> = {
        all: { label: "All statuses", badgeVariant: "outline" },
        pending: { label: "Pending", badgeVariant: "secondary" },
        approved: { label: "Approved", badgeVariant: "default" },
        rejected: { label: "Rejected", badgeVariant: "outline" },
};

const statusActions: Array<{
        label: string;
        status: EventStatus;
        icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
        { label: "Validate", status: "approved", icon: UserCheck },
        { label: "Mark pending", status: "pending", icon: RefreshCcw },
        { label: "Archive", status: "rejected", icon: UserX },
];

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

type EventsListInput = NonNullable<RouterInputs["events"]["list"]>;
type EventsListOutput = RouterOutputs["events"]["list"];
type EventListItem = EventsListOutput["items"][number];
type EventsInfiniteData = InfiniteData<EventsListOutput>;
type UpdateStatusInput = RouterInputs["events"]["updateStatus"];
type BulkUpdateStatusInput = RouterInputs["events"]["bulkUpdateStatus"];
type UpdateEventInput = RouterInputs["events"]["update"];

const adminEventKeys = {
        all: ["adminEvents"] as const,
        list: (input: RouterInputs["events"]["list"]) =>
                [...adminEventKeys.all, "list", input ?? null] as const,
} as const;

type Filters = {
        q: string;
        status: "all" | EventStatus;
        providerId: string;
        startFrom: string;
        startTo: string;
        publishedOnly: boolean;
        allDayOnly: boolean;
        priorityMin: number | null;
        priorityMax: number | null;
        view: "table" | "cards";
};

const defaultFilters: Filters = {
        q: "",
        status: "all",
        providerId: "",
        startFrom: "",
        startTo: "",
        publishedOnly: false,
        allDayOnly: false,
        priorityMin: null,
        priorityMax: null,
        view: "table",
};

function parseFiltersFromSearchParams(
        params: URLSearchParams,
        base: Filters = defaultFilters,
): Filters {
        const next: Filters = { ...base };
        const qParam = params.get("q");
        next.q = qParam ?? defaultFilters.q;

        const statusParam = params.get("status");
        if (statusParam === "all") {
                next.status = "all";
        } else if (
                statusParam &&
                (eventStatuses as readonly string[]).includes(statusParam)
        ) {
                next.status = statusParam as EventStatus;
        } else {
                next.status = defaultFilters.status;
        }

        const providerParam = params.get("providerId");
        next.providerId = providerParam ?? defaultFilters.providerId;

        const startFromParam = params.get("startFrom");
        next.startFrom = startFromParam ?? defaultFilters.startFrom;

        const startToParam = params.get("startTo");
        next.startTo = startToParam ?? defaultFilters.startTo;

        next.publishedOnly = params.get("publishedOnly") === "true";
        next.allDayOnly = params.get("allDayOnly") === "true";

        const priorityMinParam = params.get("priorityMin");
        next.priorityMin = priorityMinParam ? Number(priorityMinParam) : null;

        const priorityMaxParam = params.get("priorityMax");
        next.priorityMax = priorityMaxParam ? Number(priorityMaxParam) : null;

        const viewParam = params.get("view");
        next.view = viewParam === "cards" ? "cards" : "table";

        return next;
}

function filtersToSearchParams(filters: Filters) {
        const params = new URLSearchParams();
        if (filters.q) params.set("q", filters.q);
        if (filters.status !== "all") params.set("status", filters.status);
        if (filters.providerId) params.set("providerId", filters.providerId);
        if (filters.startFrom) params.set("startFrom", filters.startFrom);
        if (filters.startTo) params.set("startTo", filters.startTo);
        if (filters.publishedOnly) params.set("publishedOnly", "true");
        if (filters.allDayOnly) params.set("allDayOnly", "true");
        if (filters.priorityMin !== null)
                params.set("priorityMin", String(filters.priorityMin));
        if (filters.priorityMax !== null)
                params.set("priorityMax", String(filters.priorityMax));
        params.set("view", filters.view);
        return params;
}

function areFiltersEqual(a: Filters, b: Filters) {
        return (
                a.q === b.q &&
                a.status === b.status &&
                a.providerId === b.providerId &&
                a.startFrom === b.startFrom &&
                a.startTo === b.startTo &&
                a.publishedOnly === b.publishedOnly &&
                a.allDayOnly === b.allDayOnly &&
                a.priorityMin === b.priorityMin &&
                a.priorityMax === b.priorityMax &&
                a.view === b.view
        );
}

function readStoredFilters(): Filters | null {
        if (typeof window === "undefined") return null;
        const raw = window.localStorage.getItem(EVENT_FILTER_STORAGE_KEY);
        if (!raw) return null;
        try {
                const parsed = JSON.parse(raw) as Partial<Filters>;
                return { ...defaultFilters, ...parsed };
        } catch (error) {
                console.warn("Unable to parse stored event filters", error);
                return null;
        }
}

function formatDateTimeLocal(value: string | Date | null | undefined) {
        if (!value) return "";
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return format(date, "yyyy-MM-dd'T'HH:mm");
}

function formatDisplayDate(value: string | Date | null | undefined) {
        if (!value) return "";
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return format(date, "MMM d, yyyy p");
}

function buildListInput(filters: Filters): RouterInputs["events"]["list"] {
        const input: EventsListInput = {};
        if (filters.q.trim()) input.q = filters.q.trim();
        if (filters.status !== "all") input.status = filters.status;
        if (filters.providerId) input.providerId = filters.providerId;
        if (filters.publishedOnly) input.isPublished = true;
        if (filters.allDayOnly) input.isAllDay = true;
        if (filters.startFrom) {
                input.startFrom = new Date(`${filters.startFrom}T00:00:00Z`).toISOString();
        }
        if (filters.startTo) {
                input.startTo = new Date(`${filters.startTo}T23:59:59Z`).toISOString();
        }
        if (filters.priorityMin !== null || filters.priorityMax !== null) {
                input.priority = {};
                if (filters.priorityMin !== null)
                        input.priority.min = filters.priorityMin;
                if (filters.priorityMax !== null)
                        input.priority.max = filters.priorityMax;
        }
        return Object.keys(input).length ? input : undefined;
}

function patchEventsInCache(
        queryClient: QueryClient,
        queryKey: unknown,
        ids: Iterable<string>,
        patch: Partial<EventListItem>,
) {
        const idSet = new Set(ids);
        queryClient.setQueryData<EventsInfiniteData>(queryKey, (previous) => {
                if (!previous) return previous;
                return {
                        ...previous,
                        pages: previous.pages.map((page) => ({
                                ...page,
                                items: page.items.map((item) =>
                                        idSet.has(item.id) ? { ...item, ...patch } : item,
                                ),
                        })),
                } satisfies EventsInfiniteData;
        });
}

function replaceEventInCache(
        queryClient: QueryClient,
        queryKey: unknown,
        updated: EventListItem,
) {
        queryClient.setQueryData<EventsInfiniteData>(queryKey, (previous) => {
                if (!previous) return previous;
                return {
                        ...previous,
                        pages: previous.pages.map((page) => ({
                                ...page,
                                items: page.items.map((item) =>
                                        item.id === updated.id ? updated : item,
                                ),
                        })),
                } satisfies EventsInfiniteData;
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
        const router = useRouter();
        const pathname = usePathname();
        const queryClient = useQueryClient();
        const searchParams = useSearchParams();
        const searchParamsString = searchParams.toString();
        const hasInitialQuery = searchParamsString.length > 0;

        const skipSearchSyncRef = useRef(false);

        const storedFilters = typeof window !== "undefined" ? readStoredFilters() : null;

        const [filters, setFilters] = useState<Filters>(() => {
                if (hasInitialQuery) {
                        return parseFiltersFromSearchParams(searchParams);
                }
                if (storedFilters) {
                        skipSearchSyncRef.current = true;
                        return storedFilters;
                }
                return defaultFilters;
        });

        useEffect(() => {
                if (typeof window === "undefined") return;
                window.localStorage.setItem(
                        EVENT_FILTER_STORAGE_KEY,
                        JSON.stringify(filters),
                );
        }, [filters]);

        const listInput = useMemo(() => buildListInput(filters), [filters]);

        useEffect(() => {
                if (skipSearchSyncRef.current) {
                        skipSearchSyncRef.current = false;
                        return;
                }
                const nextParams = filtersToSearchParams(filters);
                const nextString = nextParams.toString();
                if (nextString === searchParamsString) {
                        return;
                }
                skipSearchSyncRef.current = true;
                router.replace(nextString ? `${pathname}?${nextString}` : pathname, {
                        scroll: false,
                });
        }, [filters, pathname, router, searchParamsString]);

        useEffect(() => {
                if (skipSearchSyncRef.current) {
                        skipSearchSyncRef.current = false;
                        return;
                }
                const parsed = hasInitialQuery || searchParamsString
                        ? parseFiltersFromSearchParams(searchParams)
                        : defaultFilters;
                if (!areFiltersEqual(filters, parsed)) {
                        setFilters(parsed);
                }
        }, [filters, hasInitialQuery, searchParams, searchParamsString]);

        const providersQuery = useQuery({
                queryKey: providerKeys.catalog.list(),
                queryFn: () => trpcClient.providers.catalog.list.query(),
        });

        const listQueryKey = useMemo(
                () => adminEventKeys.list(listInput),
                [listInput],
        );

        const eventsQuery = useInfiniteQuery({
                queryKey: listQueryKey,
                initialPageParam: undefined as EventsListInput["cursor"],
                getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
                queryFn: ({ pageParam }) => {
                        const queryInput: RouterInputs["events"]["list"] = {
                                ...(listInput ?? {}),
                                cursor: pageParam ?? undefined,
                        };

                        return trpcClient.events.list.query(queryInput);
                },
        });

        const events = useMemo(
                () =>
                        eventsQuery.data?.pages.flatMap((page) => page.items) ??
                        [],
                [eventsQuery.data?.pages],
        );

        const eventIdSet = useMemo(
                () => new Set(events.map((event) => event.id)),
                [events],
        );

        const [selectedIds, setSelectedIds] = useState<string[]>([]);

        useEffect(() => {
                setSelectedIds((prev) => prev.filter((id) => eventIdSet.has(id)));
        }, [eventIdSet]);

        useEffect(() => {
                setSelectedIds([]);
        }, [listInput]);

        const [detailId, setDetailId] = useState<string | null>(null);
        const [editDialogOpen, setEditDialogOpen] = useState(false);
        const [editingId, setEditingId] = useState<string | null>(null);
        const [editValues, setEditValues] = useState<EditValues | null>(null);

        const detailEvent = useMemo(
                () => events.find((event) => event.id === detailId) ?? null,
                [detailId, events],
        );

        const sentinelRef = useRef<HTMLDivElement | null>(null);

        useEffect(() => {
                const sentinel = sentinelRef.current;
                if (!sentinel) return undefined;
                if (!eventsQuery.hasNextPage) return undefined;

                const observer = new IntersectionObserver((entries) => {
                        const entry = entries[0];
                        if (
                                entry?.isIntersecting &&
                                eventsQuery.hasNextPage &&
                                !eventsQuery.isFetchingNextPage
                        ) {
                                eventsQuery.fetchNextPage().catch(() => {
                                        /* handled by react-query */
                                });
                        }
                });

                observer.observe(sentinel);
                return () => observer.disconnect();
        }, [eventsQuery]);

        const handleSearchChange = useCallback(
                (event: ChangeEvent<HTMLInputElement>) => {
                        const value = event.target.value;
                        setFilters((prev) => ({ ...prev, q: value }));
                },
                [],
        );

        const handleStatusChange = useCallback((value: string) => {
                setFilters((prev) => ({
                        ...prev,
                        status:
                                value === "all" ||
                                (eventStatuses as readonly string[]).includes(value)
                                        ? (value as Filters["status"])
                                        : prev.status,
                }));
        }, []);

        const handleProviderChange = useCallback((value: string) => {
                setFilters((prev) => ({ ...prev, providerId: value === "all" ? "" : value }));
        }, []);

        const handleDateChange = useCallback(
                (key: "startFrom" | "startTo") =>
                        (event: ChangeEvent<HTMLInputElement>) => {
                                const value = event.target.value;
                                setFilters((prev) => ({ ...prev, [key]: value }));
                        },
                [],
        );

        const handleToggleChange = useCallback(
                (key: "publishedOnly" | "allDayOnly") =>
                        (checked: boolean) => {
                                setFilters((prev) => ({ ...prev, [key]: checked }));
                        },
                [],
        );

        const handlePriorityChange = useCallback(
                (key: "priorityMin" | "priorityMax", value: string) => {
                        setFilters((prev) => {
                                const numeric = value === "any" ? null : Number(value);
                                const next = { ...prev, [key]: numeric } as Filters;
                                if (
                                        next.priorityMin !== null &&
                                        next.priorityMax !== null &&
                                        next.priorityMin > next.priorityMax
                                ) {
                                        if (key === "priorityMin") {
                                                next.priorityMax = next.priorityMin;
                                        } else {
                                                next.priorityMin = next.priorityMax;
                                        }
                                }
                                return next;
                        });
                },
                [],
        );

        const handleViewChange = useCallback((view: "table" | "cards") => {
                setFilters((prev) => ({ ...prev, view }));
        }, []);

        const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
        const allSelectedOnPage =
                events.length > 0 && events.every((event) => selectedIdSet.has(event.id));

        const handleSelectAll = useCallback(
                (checked: boolean) => {
                        setSelectedIds((prev) => {
                                if (checked) {
                                        const union = new Set(prev);
                                        events.forEach((event) => union.add(event.id));
                                        return Array.from(union);
                                }
                                return prev.filter((id) => !eventIdSet.has(id));
                        });
                },
                [eventIdSet, events],
        );

        const handleSelect = useCallback(
                (id: string, checked: boolean) => {
                        setSelectedIds((prev) => {
                                if (checked) {
                                        if (prev.includes(id)) return prev;
                                        return [...prev, id];
                                }
                                return prev.filter((value) => value !== id);
                        });
                },
                [],
        );

        const handleOpenDetail = useCallback((id: string) => {
                setDetailId(id);
        }, []);

        const handleCloseDetail = useCallback(() => {
                setDetailId(null);
        }, []);

        const handleEditOpen = useCallback(
                (event: EventListItem) => {
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
                },
                [],
        );

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
                        const previous = queryClient.getQueryData<EventsInfiniteData>(listQueryKey);
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
                        const previous = queryClient.getQueryData<EventsInfiniteData>(listQueryKey);
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
                                error instanceof Error
                                        ? error.message
                                        : "Unable to update events",
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
                        const previous = queryClient.getQueryData<EventsInfiniteData>(listQueryKey);
                        const patch: Partial<EventListItem> = {
                                updatedAt: new Date().toISOString() as unknown as Date,
                        };
                        if (variables.title !== undefined) patch.title = variables.title;
                        if (variables.description !== undefined)
                                patch.description =
                                        typeof variables.description === "string"
                                                ? variables.description
                                                : variables.description ?? null;
                        if (variables.location !== undefined)
                                patch.location =
                                        typeof variables.location === "string"
                                                ? variables.location
                                                : variables.location ?? null;
                        if (variables.url !== undefined)
                                patch.url =
                                        typeof variables.url === "string"
                                                ? variables.url
                                                : variables.url ?? null;
                        if (variables.startAt !== undefined) patch.startAt = variables.startAt;
                        if (variables.endAt !== undefined) patch.endAt = variables.endAt;
                        if (variables.isAllDay !== undefined)
                                patch.isAllDay = variables.isAllDay;
                        if (variables.isPublished !== undefined)
                                patch.isPublished = variables.isPublished;
                        if (variables.externalId !== undefined)
                                patch.externalId = variables.externalId ?? null;
                        if (variables.priority !== undefined)
                                patch.priority = variables.priority;
                        patchEventsInCache(queryClient, listQueryKey, [variables.id], patch);
                        return { previous };
                },
                onError: (error, _variables, context) => {
                        if (context?.previous) {
                                queryClient.setQueryData(listQueryKey, context.previous);
                        }
                        toast.error(
                                error instanceof Error
                                        ? error.message
                                        : "Unable to update event",
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
                                endAt:
                                        editValues.endAt
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
                                                        <CardTitle className="text-2xl font-semibold">
                                                                Event moderation
                                                        </CardTitle>
                                                        <CardDescription>
                                                                Review synchronized events, adjust metadata, and
                                                                update their publication state.
                                                        </CardDescription>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                        <Button
                                                                variant={
                                                                        filters.view === "table"
                                                                                ? "default"
                                                                                : "outline"
                                                                }
                                                                size="icon"
                                                                aria-label="Table view"
                                                                onClick={() => handleViewChange("table")}
                                                        >
                                                                <TableIcon className="size-4" />
                                                        </Button>
                                                        <Button
                                                                variant={
                                                                        filters.view === "cards"
                                                                                ? "default"
                                                                                : "outline"
                                                                }
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
                                                                <div className="relative flex-1 min-w-0">
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
                                                                        <Label htmlFor="events-published" className="text-sm font-medium">
                                                                                Published only
                                                                        </Label>
                                                                        <p className="text-xs text-muted-foreground">
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
                                                                        <Label htmlFor="events-allday" className="text-sm font-medium">
                                                                                All-day events
                                                                        </Label>
                                                                        <p className="text-xs text-muted-foreground">
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
                                                                onCheckedChange={(checked) =>
                                                                        handleSelectAll(Boolean(checked))
                                                                }
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
                                ) : filters.view === "table" ? (
                                        <div className="overflow-hidden rounded-lg border">
                                                <Table>
                                                        <TableHeader className="bg-muted/40">
                                                                <TableRow>
                                                                        <TableHead className="w-12">
                                                                                <Checkbox
                                                                                        checked={headerCheckboxState}
                                                                                        onCheckedChange={(checked) =>
                                                                                                handleSelectAll(Boolean(checked))
                                                                                        }
                                                                                        aria-label="Select all events"
                                                                                />
                                                                        </TableHead>
                                                                        <TableHead>Event</TableHead>
                                                                        <TableHead>Schedule</TableHead>
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
                                                                                                                handleSelect(
                                                                                                                        event.id,
                                                                                                                        Boolean(
                                                                                                                                checked,
                                                                                                                        ),
                                                                                                                )
                                                                                                        }
                                                                                                        aria-label={`Select event ${event.title}`}
                                                                                                />
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                                <div className="flex flex-col gap-1">
                                                                                                        <div className="flex items-center gap-2">
                                                                                                                <span className="font-medium">
                                                                                                                        {event.title}
                                                                                                                </span>
                                                                                                                {event.isAllDay ? (
                                                                                                                        <Badge
                                                                                                                                variant="outline"
                                                                                                                                className="uppercase"
                                                                                                                        >
                                                                                                                                All-day
                                                                                                                        </Badge>
                                                                                                                ) : null}
                                                                                                                {event.flag ? (
                                                                                                                        <Badge
                                                                                                                                variant="secondary"
                                                                                                                                className="gap-1"
                                                                                                                        >
                                                                                                                                <Tag className="size-3" />
                                                                                                                                {event.flag.label}
                                                                                                                        </Badge>
                                                                                                                ) : null}
                                                                                                        </div>
                                                                                                        {event.description ? (
                                                                                                                <p className="line-clamp-2 text-muted-foreground text-sm">
                                                                                                                        {event.description}
                                                                                                                </p>
                                                                                                        ) : null}
                                                                                                        {event.location ? (
                                                                                                                <p className="flex items-center gap-1 text-muted-foreground text-xs">
                                                                                                                        <MapPin className="size-3" />
                                                                                                                        {event.location}
                                                                                                                </p>
                                                                                                        ) : null}
                                                                                                </div>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                                <div className="flex flex-col gap-1 text-sm">
                                                                                                        <span className="flex items-center gap-1">
                                                                                                                <Calendar className="size-3" />
                                                                                                                {formatDisplayDate(event.startAt)}
                                                                                                        </span>
                                                                                                        {event.endAt ? (
                                                                                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                                                                                        <Clock className="size-3" />
                                                                                                                        {formatDisplayDate(event.endAt)}
                                                                                                                </span>
                                                                                                        ) : null}
                                                                                                </div>
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
                                                                                                <Badge variant={statusOptionMap[event.status].badgeVariant}>
                                                                                                        {statusOptionMap[event.status].label}
                                                                                                </Badge>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                                <Badge variant="outline">{event.priority}</Badge>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                                <Badge
                                                                                                        variant={
                                                                                                                event.isPublished
                                                                                                                        ? "default"
                                                                                                                        : "outline"
                                                                                                        }
                                                                                                >
                                                                                                        {event.isPublished ? "Published" : "Draft"}
                                                                                                </Badge>
                                                                                        </TableCell>
                                                                                        <TableCell className="text-right">
                                                                                                <DropdownMenu>
                                                                                                        <DropdownMenuTrigger asChild>
                                                                                                                <Button variant="ghost" size="icon">
                                                                                                                        <MoreHorizontal className="size-4" />
                                                                                                                </Button>
                                                                                                        </DropdownMenuTrigger>
                                                                                                        <DropdownMenuContent align="end" className="w-48">
                                                                                                                <DropdownMenuLabel>
                                                                                                                        Moderation
                                                                                                                </DropdownMenuLabel>
                                                                                                                {statusActions.map((action) => (
                                                                                                                        <DropdownMenuItem
                                                                                                                                key={action.status}
                                                                                                                                onClick={() =>
                                                                                                                                        handleStatusAction(
                                                                                                                                                event.id,
                                                                                                                                                action.status,
                                                                                                                                        )
                                                                                                                                }
                                                                                                                        >
                                                                                                                                <action.icon className="mr-2 size-4" />
                                                                                                                                {action.label}
                                                                                                                        </DropdownMenuItem>
                                                                                                                ))}
                                                                                                                <DropdownMenuSeparator />
                                                                                                                <DropdownMenuItem
                                                                                                                        onClick={() => handleEditOpen(event)}
                                                                                                                >
                                                                                                                        Edit event
                                                                                                                </DropdownMenuItem>
                                                                                                                <DropdownMenuItem
                                                                                                                        onClick={() => handleOpenDetail(event.id)}
                                                                                                                >
                                                                                                                        View details
                                                                                                                </DropdownMenuItem>
                                                                                                        </DropdownMenuContent>
                                                                                                </DropdownMenu>
                                                                                        </TableCell>
                                                                                </TableRow>
                                                                        );
                                                                })}
                                                        </TableBody>
                                                </Table>
                                        </div>
                                ) : (
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
                                                                                        <div className="flex flex-col gap-2">
                                                                                                <div className="flex items-center gap-2">
                                                                                                        <Checkbox
                                                                                                                checked={isSelected}
                                                                                                                onCheckedChange={(checked) =>
                                                                                                                        handleSelect(
                                                                                                                                event.id,
                                                                                                                                Boolean(
                                                                                                                                        checked,
                                                                                                                                ),
                                                                                                                        )
                                                                                                                }
                                                                                                                aria-label={`Select event ${event.title}`}
                                                                                                        />
                                                                                                        <Badge variant={statusOptionMap[event.status].badgeVariant}>
                                                                                                                {statusOptionMap[event.status].label}
                                                                                                        </Badge>
                                                                                                </div>
                                                                                                <CardTitle className="text-xl">
                                                                                                        {event.title}
                                                                                                </CardTitle>
                                                                                        </div>
                                                                                        <DropdownMenu>
                                                                                                <DropdownMenuTrigger asChild>
                                                                                                        <Button variant="ghost" size="icon">
                                                                                                                <MoreHorizontal className="size-4" />
                                                                                                        </Button>
                                                                                                </DropdownMenuTrigger>
                                                                                                <DropdownMenuContent align="end" className="w-48">
                                                                                                        <DropdownMenuLabel>
                                                                                                                Moderation
                                                                                                        </DropdownMenuLabel>
                                                                                                        {statusActions.map((action) => (
                                                                                                                <DropdownMenuItem
                                                                                                                        key={action.status}
                                                                                                                        onClick={() =>
                                                                                                                                handleStatusAction(
                                                                                                                                        event.id,
                                                                                                                                        action.status,
                                                                                                                                )
                                                                                                                        }
                                                                                                                >
                                                                                                                        <action.icon className="mr-2 size-4" />
                                                                                                                        {action.label}
                                                                                                                </DropdownMenuItem>
                                                                                                        ))}
                                                                                                        <DropdownMenuSeparator />
                                                                                                        <DropdownMenuItem onClick={() => handleEditOpen(event)}>
                                                                                                                Edit event
                                                                                                        </DropdownMenuItem>
                                                                                                        <DropdownMenuItem onClick={() => handleOpenDetail(event.id)}>
                                                                                                                View details
                                                                                                        </DropdownMenuItem>
                                                                                                </DropdownMenuContent>
                                                                                        </DropdownMenu>
                                                                                </div>
                                                                                {event.description ? (
                                                                                        <CardDescription className="line-clamp-3 text-sm">
                                                                                                {event.description}
                                                                                        </CardDescription>
                                                                                ) : null}
                                                                        </CardHeader>
                                                                        <CardContent className="flex flex-1 flex-col gap-4">
                                                                                <div className="flex flex-wrap gap-3 text-sm">
                                                                                        <span className="flex items-center gap-2 rounded-md border bg-muted/60 px-2 py-1">
                                                                                                <CalendarClock className="size-4" />
                                                                                                {formatDisplayDate(event.startAt)}
                                                                                        </span>
                                                                                        {event.endAt ? (
                                                                                                <span className="flex items-center gap-2 rounded-md border bg-muted/60 px-2 py-1 text-muted-foreground">
                                                                                                        <Clock className="size-4" />
                                                                                                        {formatDisplayDate(event.endAt)}
                                                                                                </span>
                                                                                        ) : null}
                                                                                        <span className="flex items-center gap-2 rounded-md border bg-muted/60 px-2 py-1 text-muted-foreground">
                                                                                                <Tag className="size-4" />
                                                                                                Priority {event.priority}
                                                                                        </span>
                                                                                        <span className="flex items-center gap-2 rounded-md border bg-muted/60 px-2 py-1 text-muted-foreground">
                                                                                                <ExternalLink className="size-4" />
                                                                                                {event.isPublished ? "Published" : "Draft"}
                                                                                        </span>
                                                                                </div>
                                                                                <div className="space-y-2 text-sm">
                                                                                        <p className="flex items-center gap-2 text-muted-foreground">
                                                                                                <MapPin className="size-4" />
                                                                                                {event.location ?? "No location"}
                                                                                        </p>
                                                                                        <p className="flex items-center gap-2 text-muted-foreground">
                                                                                                <CalendarDays className="size-4" />
                                                                                                Provider: {event.provider?.name ?? "Unassigned"}
                                                                                        </p>
                                                                                        {event.flag ? (
                                                                                                <p className="flex items-center gap-2 text-muted-foreground">
                                                                                                        <Tag className="size-4" />
                                                                                                        Flagged: {event.flag.label}
                                                                                                </p>
                                                                                        ) : null}
                                                                                </div>
                                                                                <div className="mt-auto flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                                                        <span>ID: {event.id}</span>
                                                                                        {event.externalId ? (
                                                                                                <span>Source #{event.externalId}</span>
                                                                                        ) : null}
                                                                                </div>
                                                                        </CardContent>
                                                                </Card>
                                                        );
                                                })}
                                        </div>
                                )}

                                <div ref={sentinelRef} className="h-12" aria-hidden />
                                {eventsQuery.isFetchingNextPage ? (
                                        <p className="text-center text-muted-foreground text-sm">
                                                Loading more events…
                                        </p>
                                ) : null}
                        </section>

                        <Sheet
                                open={detailEvent != null}
                                onOpenChange={(open) => {
                                        if (!open) handleCloseDetail();
                                }}
                        >
                                <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
                                        <SheetHeader>
                                                <SheetTitle>{detailEvent?.title ?? "Event details"}</SheetTitle>
                                                <SheetDescription>
                                                        Review the synchronized metadata before applying moderation changes.
                                                </SheetDescription>
                                        </SheetHeader>
                                        {detailEvent ? (
                                                <div className="mt-6 space-y-6">
                                                        <div className="space-y-2">
                                                                <p className="text-sm text-muted-foreground">
                                                                        Event ID: {detailEvent.id}
                                                                </p>
                                                                {detailEvent.externalId ? (
                                                                        <p className="text-sm text-muted-foreground">
                                                                                External ID: {detailEvent.externalId}
                                                                        </p>
                                                                ) : null}
                                                                <div className="flex flex-wrap gap-2">
                                                                        <Badge variant={statusOptionMap[detailEvent.status].badgeVariant}>
                                                                                {statusOptionMap[detailEvent.status].label}
                                                                        </Badge>
                                                                        <Badge variant={detailEvent.isPublished ? "default" : "outline"}>
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
                                                                                prev
                                                                                        ? { ...prev, title: event.target.value }
                                                                                        : prev,
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
                                                                        <Label htmlFor="event-published" className="text-sm font-medium">
                                                                                Published
                                                                        </Label>
                                                                        <p className="text-xs text-muted-foreground">
                                                                                Toggle whether the event is visible externally.
                                                                        </p>
                                                                </div>
                                                                <Switch
                                                                        id="event-published"
                                                                        checked={editValues?.isPublished ?? false}
                                                                        onCheckedChange={(checked) =>
                                                                                setEditValues((prev) =>
                                                                                        prev
                                                                                                ? { ...prev, isPublished: checked }
                                                                                                : prev,
                                                                                )
                                                                        }
                                                                />
                                                        </div>
                                                </div>
                                                <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
                                                        <div>
                                                                <Label htmlFor="event-allday" className="text-sm font-medium">
                                                                        All-day event
                                                                </Label>
                                                                <p className="text-xs text-muted-foreground">
                                                                        Set to true if this event spans the entire day.
                                                                </p>
                                                        </div>
                                                        <Switch
                                                                id="event-allday"
                                                                checked={editValues?.isAllDay ?? false}
                                                                onCheckedChange={(checked) =>
                                                                        setEditValues((prev) =>
                                                                                prev
                                                                                        ? { ...prev, isAllDay: checked }
                                                                                        : prev,
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
                                                        <Button
                                                                type="submit"
                                                                disabled={updateEventMutation.isPending}
                                                        >
                                                                {updateEventMutation.isPending ? "Saving…" : "Save changes"}
                                                        </Button>
                                                </DialogFooter>
                                        </form>
                                </DialogContent>
                        </Dialog>
                </AppShell>
        );
}
