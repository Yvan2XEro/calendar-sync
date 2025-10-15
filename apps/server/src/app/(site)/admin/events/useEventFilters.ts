import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	areFiltersEqual,
	buildListInput,
	defaultFilters,
	EVENT_FILTER_STORAGE_KEY,
	type EventsListFilters,
	eventStatuses,
	type Filters,
	filtersToSearchParams,
	parseFiltersFromSearchParams,
	readStoredFilters,
} from "./event-filters";

type UseEventFiltersOptions = {
        defaultLimit?: number;
        preserveParams?: readonly string[];
};

type UseEventFiltersResult = {
	filters: Filters;
	listFilters: EventsListFilters | undefined;
	listParams: (EventsListFilters | undefined) & { page: number; limit: number };
	page: number;
	setPage: Dispatch<SetStateAction<number>>;
	limit: number;
	setLimit: Dispatch<SetStateAction<number>>;
	handleSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
	handleStatusChange: (value: string) => void;
	handleProviderChange: (value: string) => void;
	handleDateChange: (
		key: "startFrom" | "startTo",
	) => (event: ChangeEvent<HTMLInputElement>) => void;
	handleToggleChange: (
		key: "publishedOnly" | "allDayOnly",
	) => (checked: boolean) => void;
	handlePriorityChange: (
		key: "priorityMin" | "priorityMax",
		value: string,
	) => void;
	handleViewChange: (view: "table" | "card") => void;
};

export function useEventFilters(
        options: UseEventFiltersOptions = {},
): UseEventFiltersResult {
        const router = useRouter();
        const pathname = usePathname();
        const searchParams = useSearchParams();
        const searchParamsString = searchParams.toString();
        const hasInitialQuery = searchParamsString.length > 0;

        const preserveParamsList = options.preserveParams ?? [];
        const preserveParamsKey = preserveParamsList.join("\0");

	const skipSearchSyncRef = useRef(false);

	const storedFilters =
		typeof window !== "undefined" ? readStoredFilters() : null;

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

	const listFilters = useMemo(() => buildListInput(filters), [filters]);

        const defaultLimit = options.defaultLimit ?? 25;
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(defaultLimit);

	const listParams = useMemo(
		() => ({
			...((listFilters ?? {}) as EventsListFilters),
			page,
			limit,
		}),
		[limit, listFilters, page],
	);

	useEffect(() => {
		if (skipSearchSyncRef.current) {
			skipSearchSyncRef.current = false;
			return;
		}
                const nextParams = filtersToSearchParams(filters);
                if (preserveParamsList.length > 0) {
                        for (const key of preserveParamsList) {
                                const value = searchParams.get(key);
                                if (value !== null) {
                                        nextParams.set(key, value);
                                }
                        }
                }
                const nextString = nextParams.toString();
                if (nextString === searchParamsString) {
                        return;
                }
                skipSearchSyncRef.current = true;
		const queryEntries = Array.from(nextParams.entries()).map<[string, string]>(
			([key, value]) => [key, value],
		);
		const nextUrl =
			queryEntries.length > 0 ? `${pathname}?${nextString}` : pathname;
		router.replace(nextUrl as any, { scroll: false });
        }, [filters, pathname, router, searchParamsString, preserveParamsKey]);

	useEffect(() => {
		if (skipSearchSyncRef.current) {
			skipSearchSyncRef.current = false;
			return;
		}
		const parsed =
			hasInitialQuery || searchParamsString
				? parseFiltersFromSearchParams(searchParams)
				: defaultFilters;
		if (!areFiltersEqual(filters, parsed)) {
			setFilters(parsed);
		}
	}, [filters, hasInitialQuery, searchParams, searchParamsString]);

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
				value === "all" || (eventStatuses as readonly string[]).includes(value)
					? (value as Filters["status"])
					: prev.status,
		}));
	}, []);

	const handleProviderChange = useCallback((value: string) => {
		setFilters((prev) => ({
			...prev,
			providerId: value === "all" ? "" : value,
		}));
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
		(key: "publishedOnly" | "allDayOnly") => (checked: boolean) => {
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

	const handleViewChange = useCallback((view: "table" | "card") => {
		setFilters((prev) => ({ ...prev, view }));
	}, []);

	return {
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
	};
}
