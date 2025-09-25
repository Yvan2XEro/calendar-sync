"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { format } from "date-fns";
import { useEffect, useId, useMemo, useRef, useState } from "react";

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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { useAdminLogStream, useAdminLogs } from "@/hooks/use-admin-logs";
import { providerKeys } from "@/lib/query-keys/providers";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProvidersCatalogListOutput = RouterOutputs["providers"]["catalog"]["list"];

const LOG_LEVELS = [
	{ value: "debug", label: "Debug" },
	{ value: "info", label: "Info" },
	{ value: "warn", label: "Warning" },
	{ value: "error", label: "Error" },
];

function formatTimestamp(value: Date | string | null | undefined) {
	if (!value) return "";

	const date = value instanceof Date ? value : new Date(value);

	if (Number.isNaN(date.valueOf())) {
		return "";
	}

	return format(date, "PPpp");
}

function getLevelBadgeVariant(level: string) {
	const normalized = level.toLowerCase();

	if (normalized === "error" || normalized === "fatal") {
		return "destructive" as const;
	}

	if (normalized === "warn" || normalized === "warning") {
		return "secondary" as const;
	}

	if (normalized === "debug") {
		return "outline" as const;
	}

	return "default" as const;
}

export default function AdminLogsPage() {
	const [providerFilter, setProviderFilter] = useState<string | null>(null);
	const [levelFilter, setLevelFilter] = useState<string | null>(null);

	const providerQuery = useQuery<ProvidersCatalogListOutput>({
		queryKey: providerKeys.catalog.list(),
		queryFn: () => trpcClient.providers.catalog.list.query(),
	});
	const logsQuery = useAdminLogs({
		providerId: providerFilter,
		level: levelFilter,
	});
	const providerSelectId = useId();
	const levelSelectId = useId();

	const { fetchNextPage, hasNextPage, isFetchingNextPage } = logsQuery;

	const rows = logsQuery.data?.pages.flatMap((page) => page.logs) ?? [];
	const latest = rows[0];

	useAdminLogStream(
		{ providerId: providerFilter, level: levelFilter },
		latest,
		logsQuery.isPending,
	);

	const providerMap = useMemo(() => {
		const map = new Map<string, string>();

		if (providerQuery.data) {
			for (const provider of providerQuery.data) {
				map.set(provider.id, provider.name);
			}
		}

		return map;
	}, [providerQuery.data]);

	const sentinelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const node = sentinelRef.current;

		if (!node) return;

		const observer = new IntersectionObserver((entries) => {
			const entry = entries[0];

			if (!entry?.isIntersecting) return;

			if (hasNextPage && !isFetchingNextPage) {
				void fetchNextPage();
			}
		});

		observer.observe(node);

		return () => observer.disconnect();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	const renderDataDialog = (data: unknown, id: number) => {
		if (data == null) {
			return <span className="text-muted-foreground">-</span>;
		}

		return (
			<Dialog>
				<DialogTrigger asChild>
					<Button variant="ghost" size="sm">
						View
					</Button>
				</DialogTrigger>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Log data</DialogTitle>
						<DialogDescription>
							Payload associated with worker log #{id}.
						</DialogDescription>
					</DialogHeader>
					<pre className="mt-4 max-h-80 overflow-auto rounded bg-muted p-4 text-xs">
						{JSON.stringify(data, null, 2)}
					</pre>
				</DialogContent>
			</Dialog>
		);
	};

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{ label: "Logs", current: true },
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />
			<Card>
				<CardHeader className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
					<div>
						<CardTitle>Worker logs</CardTitle>
						<CardDescription>
							Monitor worker sessions in real time with streaming updates.
						</CardDescription>
					</div>
					<div className="flex flex-wrap items-end gap-4">
						<div className="flex w-52 flex-col gap-2">
							<Label htmlFor={providerSelectId}>Provider</Label>
							{providerQuery.isLoading ? (
								<Skeleton className="h-10 w-full" />
							) : (
								<Select
									value={providerFilter ?? "all"}
									onValueChange={(value) =>
										setProviderFilter(value === "all" ? null : value)
									}
								>
									<SelectTrigger id={providerSelectId}>
										<SelectValue placeholder="All providers" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All providers</SelectItem>
										{providerQuery.data?.map(
											(provider: ProvidersCatalogListOutput[number]) => (
												<SelectItem key={provider.id} value={provider.id}>
													{provider.name}
												</SelectItem>
											),
										)}
									</SelectContent>
								</Select>
							)}
						</div>
						<div className="flex w-52 flex-col gap-2">
							<Label htmlFor={levelSelectId}>Level</Label>
							<Select
								value={levelFilter ?? "all"}
								onValueChange={(value) =>
									setLevelFilter(value === "all" ? null : value)
								}
							>
								<SelectTrigger id={levelSelectId}>
									<SelectValue placeholder="All levels" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All levels</SelectItem>
									{LOG_LEVELS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{logsQuery.isError ? (
						<Alert variant="destructive">
							<AlertTitle>Unable to load logs</AlertTitle>
							<AlertDescription>
								{logsQuery.error instanceof Error
									? logsQuery.error.message
									: "Something went wrong while fetching logs."}
							</AlertDescription>
						</Alert>
					) : logsQuery.isLoading ? (
						<div className="space-y-3">
							{[0, 1, 2, 3, 4].map((index) => (
								<Skeleton key={index} className="h-16 w-full" />
							))}
						</div>
					) : rows.length === 0 ? (
						<Alert>
							<AlertTitle>No logs yet</AlertTitle>
							<AlertDescription>
								Worker output will appear here as soon as new jobs run.
							</AlertDescription>
						</Alert>
					) : (
						<div className="space-y-4">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-48">Timestamp</TableHead>
										<TableHead className="w-44">Provider</TableHead>
										<TableHead className="w-40">Session</TableHead>
										<TableHead className="w-28">Level</TableHead>
										<TableHead>Message</TableHead>
										<TableHead className="w-28">Data</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{rows.map((row) => (
										<TableRow key={row.id}>
											<TableCell className="font-mono text-xs">
												{formatTimestamp(row.ts)}
											</TableCell>
											<TableCell className="text-sm">
												{row.providerId
													? (providerMap.get(row.providerId) ?? row.providerId)
													: "-"}
											</TableCell>
											<TableCell className="text-sm">
												{row.sessionId ?? "-"}
											</TableCell>
											<TableCell>
												<Badge variant={getLevelBadgeVariant(row.level)}>
													{row.level.toUpperCase()}
												</Badge>
											</TableCell>
											<TableCell className="text-sm">{row.msg}</TableCell>
											<TableCell>
												{renderDataDialog(row.data, row.id)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
							<div ref={sentinelRef} />
							{isFetchingNextPage ? (
								<p className="text-muted-foreground text-sm">
									Loading more logs...
								</p>
							) : null}
							{!hasNextPage && rows.length > 0 ? (
								<p className="text-muted-foreground text-sm">
									You&apos;ve reached the end of the available history.
								</p>
							) : null}
						</div>
					)}
				</CardContent>
			</Card>
		</AppShell>
	);
}
