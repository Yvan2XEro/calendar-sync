export const EVENT_FILTER_STORAGE_KEY = "admin.events.filters";

export const eventStatuses = ["pending", "approved", "rejected"] as const;
export type EventStatus = (typeof eventStatuses)[number];

export const statusOptionMap: Record<
	"all" | EventStatus,
	{ label: string; badgeVariant: "default" | "secondary" | "outline" }
> = {
	all: { label: "All statuses", badgeVariant: "outline" },
	pending: { label: "Pending", badgeVariant: "secondary" },
	approved: { label: "Approved", badgeVariant: "default" },
	rejected: { label: "Rejected", badgeVariant: "outline" },
};

export interface EventsListFilters {
	providerId?: string;
	status?: EventStatus;
	flagId?: string | null;
	isPublished?: boolean;
	isAllDay?: boolean;
	q?: string;
	startFrom?: string;
	startTo?: string;
	priority?: {
		min?: number;
		max?: number;
	};
}

export type Filters = {
	q: string;
	status: "all" | EventStatus;
	providerId: string;
	startFrom: string;
	startTo: string;
	publishedOnly: boolean;
	allDayOnly: boolean;
	priorityMin: number | null;
	priorityMax: number | null;
	view: "table" | "card";
};

export const defaultFilters: Filters = {
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

export function parseFiltersFromSearchParams(
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
		next.status = statusParam as Filters["status"];
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
	next.view = viewParam === "card" ? "card" : "table";

	return next;
}

export function filtersToSearchParams(filters: Filters) {
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

export function areFiltersEqual(a: Filters, b: Filters) {
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

export function readStoredFilters(): Filters | null {
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

export function buildListInput(
	filters: Filters,
): EventsListFilters | undefined {
	const input: EventsListFilters = {};
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
		const priority: NonNullable<EventsListFilters["priority"]> = {};
		if (filters.priorityMin !== null) priority.min = filters.priorityMin;
		if (filters.priorityMax !== null) priority.max = filters.priorityMax;
		input.priority = priority;
	}
	return Object.keys(input).length ? input : undefined;
}
