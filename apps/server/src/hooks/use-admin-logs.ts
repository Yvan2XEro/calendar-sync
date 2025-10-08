"use client";

import {
	type InfiniteData,
	useInfiniteQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { type LogFilterParams, logsKeys } from "@/lib/query-keys/logs";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

export type LogFilters = {
	providerId?: string | null;
	level?: string | null;
};

type LogsRouterOutputs = inferRouterOutputs<AppRouter>["adminLogs"];
export type LogListResult = LogsRouterOutputs["list"];
export type LogEntry = LogListResult["logs"][number];

type StreamLogPayload = {
	id: number;
	ts: string;
	level: string;
	providerId: string | null;
	sessionId: string | null;
	msg: string;
	data: unknown;
};

export function useAdminLogs(filters: LogFilters) {
	const queryFilters = useMemo<LogFilterParams>(
		() => ({
			providerId: filters.providerId ?? null,
			level: filters.level ?? null,
			since: null,
		}),
		[filters.providerId, filters.level],
	);

	return useInfiniteQuery<LogListResult>({
		queryKey: logsKeys.list(queryFilters),
		initialPageParam: undefined as number | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		queryFn: ({ pageParam }) =>
			trpcClient.adminLogs.list.query({
				providerId: queryFilters.providerId ?? undefined,
				level: queryFilters.level ?? undefined,
				cursor: (pageParam as any) ?? undefined,
			}),
	});
}

export function mergeLogsIntoPages(
	existing: InfiniteData<LogListResult> | undefined,
	incoming: LogEntry[],
): InfiniteData<LogListResult> {
	if (incoming.length === 0) {
		return (
			existing ?? {
				pageParams: [undefined],
				pages: [
					{
						logs: [],
						nextCursor: null,
					},
				],
			}
		);
	}

	const uniqueIncoming: LogEntry[] = [];
	const seenIncoming = new Set<number>();

	for (const entry of incoming) {
		if (seenIncoming.has(entry.id)) {
			continue;
		}

		uniqueIncoming.push(entry);
		seenIncoming.add(entry.id);
	}

	if (!existing || existing.pages.length === 0) {
		return {
			pageParams: existing?.pageParams ?? [undefined],
			pages: [
				{
					logs: uniqueIncoming,
					nextCursor: existing?.pages[0]?.nextCursor ?? null,
				},
				...(existing?.pages?.slice(1) ?? []),
			],
		} satisfies InfiniteData<LogListResult>;
	}

	const dedupeIds = new Set<number>(
		uniqueIncoming.map((log: LogEntry) => log.id),
	);
	const [firstPage, ...rest] = existing.pages;

	return {
		pageParams: existing.pageParams,
		pages: [
			{
				...firstPage,
				logs: [
					...uniqueIncoming,
					...firstPage.logs.filter((log: LogEntry) => !dedupeIds.has(log.id)),
				],
			},
			...rest.map((page: LogListResult) => ({
				...page,
				logs: page.logs.filter((log: LogEntry) => !dedupeIds.has(log.id)),
			})),
		],
	} satisfies InfiniteData<LogListResult>;
}

export function useAdminLogStream(
	filters: LogFilters,
	latest?: LogEntry,
	isInitialLoading?: boolean,
) {
	const queryClient = useQueryClient();

	const queryFilters = useMemo<LogFilterParams>(
		() => ({
			providerId: filters.providerId ?? null,
			level: filters.level ?? null,
			since: null,
		}),
		[filters.providerId, filters.level],
	);

	const queryKey = useMemo(() => logsKeys.list(queryFilters), [queryFilters]);

	const sinceRef = useRef<string | undefined>(undefined);
	const isInitialLoadingRef = useRef(Boolean(isInitialLoading));
	const bufferRef = useRef<LogEntry[]>([]);

	const applyLogs = useCallback(
		(entries: LogEntry[]) => {
			if (entries.length === 0) {
				return;
			}

			queryClient.setQueryData<InfiniteData<LogListResult>>(
				queryKey,
				(existing) => mergeLogsIntoPages(existing, entries),
			);
		},
		[queryClient, queryKey],
	);

	const flushBuffer = useCallback(() => {
		if (bufferRef.current.length === 0) {
			return;
		}

		const entries = bufferRef.current;
		bufferRef.current = [];
		applyLogs(entries);
	}, [applyLogs]);

	useEffect(() => {
		isInitialLoadingRef.current = Boolean(isInitialLoading);

		if (!isInitialLoading) {
			flushBuffer();
		}
	}, [flushBuffer, isInitialLoading]);

	useEffect(() => {
		if (!latest?.ts) {
			sinceRef.current = undefined;
			return;
		}

		const value = new Date(latest.ts);

		if (Number.isNaN(value.valueOf())) {
			sinceRef.current = undefined;
			return;
		}

		sinceRef.current = value.toISOString();
	}, [latest]);

	useEffect(() => {
		bufferRef.current = [];

		if (typeof window === "undefined") {
			return;
		}

		let stop = false;
		let source: EventSource | null = null;
		let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

		const connect = () => {
			if (stop) return;

			const url = new URL("/admin/logs/stream", window.location.origin);

			if (queryFilters.providerId) {
				url.searchParams.set("providerId", queryFilters.providerId);
			}

			if (queryFilters.level) {
				url.searchParams.set("level", queryFilters.level);
			}

			if (sinceRef.current) {
				url.searchParams.set("since", sinceRef.current);
			}

			source = new EventSource(url.toString(), { withCredentials: true });

			source.addEventListener("log", (event) => {
				const message = event as MessageEvent<string>;

				try {
					const payload = JSON.parse(message.data) as StreamLogPayload;

					const normalized: LogEntry = {
						...payload,
						ts: new Date(payload.ts).toISOString(),
						data: (payload.data as any) ?? null,
					};

					if (isInitialLoadingRef.current) {
						bufferRef.current = [
							normalized,
							...bufferRef.current.filter(
								(entry) => entry.id !== normalized.id,
							),
						];
						return;
					}

					applyLogs([normalized]);
				} catch (error) {
					console.error("Failed to process log event", error);
				}
			});

			source.onerror = () => {
				source?.close();

				if (stop) return;

				reconnectTimeout = setTimeout(connect, 3000);
			};
		};

		connect();

		return () => {
			stop = true;

			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
			}

			source?.close();
		};
	}, [applyLogs, queryFilters]);
}
