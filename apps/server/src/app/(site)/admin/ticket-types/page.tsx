"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { format, formatDistanceToNow } from "date-fns";
import * as React from "react";

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
import { Input } from "@/components/ui/input";
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
import { ticketTypeKeys } from "@/lib/query-keys/ticket-types";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type TicketTypeListOutput = RouterOutputs["adminTicketTypes"]["list"];

type StatusFilter = "all" | TicketTypeListOutput["items"][number]["status"];

type ListParams = {
	page: number;
	pageSize: number;
	q?: string;
	status?: TicketTypeListOutput["items"][number]["status"];
};

const statusOptions: { label: string; value: StatusFilter }[] = [
	{ label: "All statuses", value: "all" },
	{ label: "Active", value: "active" },
	{ label: "Draft", value: "draft" },
	{ label: "Archived", value: "archived" },
];

const pageSizeOptions = [10, 25, 50] as const;

function useDebouncedValue<T>(value: T, delay = 400) {
	const [debounced, setDebounced] = React.useState(value);

	React.useEffect(() => {
		const timeout = window.setTimeout(() => setDebounced(value), delay);
		return () => window.clearTimeout(timeout);
	}, [value, delay]);

	return debounced;
}

function formatCurrency(amountCents: number, currency: string) {
	const normalizedCurrency = currency?.toUpperCase() || "USD";
	const amount = amountCents / 100;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: normalizedCurrency,
		}).format(amount);
	} catch (error) {
		return `${normalizedCurrency} ${amount.toFixed(2)}`;
	}
}

function formatSalesWindow(
	start: Date | string | null,
	end: Date | string | null,
) {
	const startDate = start ? new Date(start) : null;
	const endDate = end ? new Date(end) : null;

	if (!startDate && !endDate) {
		return {
			summary: "Always available",
			details: "This ticket is available without a sales window.",
		} as const;
	}

	const parts: string[] = [];

	if (startDate) {
		parts.push(`Starts ${formatDistanceToNow(startDate, { addSuffix: true })}`);
	}

	if (endDate) {
		parts.push(`Ends ${formatDistanceToNow(endDate, { addSuffix: true })}`);
	}

	const summary = parts.join(" · ");
	const details = [
		startDate ? `Sales start: ${format(startDate, "PPP p")}` : null,
		endDate ? `Sales end: ${format(endDate, "PPP p")}` : null,
	]
		.filter(Boolean)
		.join("\n");

	return {
		summary: summary || "Scheduled",
		details,
	} as const;
}

const statusVariantMap: Record<
	Exclude<StatusFilter, "all">,
	"default" | "outline" | "secondary"
> = {
	active: "default",
	draft: "outline",
	archived: "secondary",
};

export default function AdminTicketTypesPage() {
	const [search, setSearch] = React.useState("");
	const [status, setStatus] = React.useState<StatusFilter>("all");
	const [page, setPage] = React.useState(1);
	const [pageSize, setPageSize] =
		React.useState<(typeof pageSizeOptions)[number]>(25);

	const debouncedSearch = useDebouncedValue(search);

	React.useEffect(() => {
		setPage(1);
	}, [debouncedSearch, status, pageSize]);

	const listParams = React.useMemo<ListParams>(() => {
		const params: ListParams = {
			page,
			pageSize,
		};

		if (debouncedSearch) {
			params.q = debouncedSearch;
		}

		if (status !== "all") {
			params.status = status;
		}

		return params;
	}, [debouncedSearch, page, pageSize, status]);

	const queryKey = React.useMemo(
		() => ticketTypeKeys.list(listParams),
		[listParams],
	);

	const listQuery = useQuery<
		TicketTypeListOutput,
		Error,
		TicketTypeListOutput,
		typeof queryKey
	>({
		queryKey,
		queryFn: () => trpcClient.adminTicketTypes.list.query(listParams),
		placeholderData: (previous) => previous,
	});

	const listData = listQuery.data;
	const rows = listData?.items ?? [];
	const totalPages = listData ? listData.totalPages : 1;
	const isLoading = listQuery.isPending;
	const hasError = listQuery.isError;
	const errorMessage =
		listQuery.error instanceof Error
			? listQuery.error.message
			: "Unable to load ticket types.";

	const summaryStart =
		listData && listData.total > 0
			? (listData.page - 1) * listData.pageSize + 1
			: 0;
	const summaryEnd =
		listData && listData.total > 0
			? Math.min(listData.total, listData.page * listData.pageSize)
			: 0;

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{ label: "Ticket types", current: true },
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />
			<Card>
				<CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<CardTitle>Ticket types</CardTitle>
						<CardDescription>
							Review and manage ticket templates across all events.
						</CardDescription>
					</div>
					<div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
						<div className="flex w-full items-center gap-2 md:w-80">
							<Input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search by ticket or event name"
								aria-label="Search ticket types"
							/>
							{search ? (
								<Button variant="ghost" size="sm" onClick={() => setSearch("")}>
									Clear
								</Button>
							) : null}
						</div>
						<div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
							<Select
								value={status}
								onValueChange={(value: StatusFilter) => setStatus(value)}
							>
								<SelectTrigger className="w-full md:w-48">
									<SelectValue placeholder="Status" />
								</SelectTrigger>
								<SelectContent>
									{statusOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={String(pageSize)}
								onValueChange={(value) =>
									setPageSize(Number(value) as (typeof pageSizeOptions)[number])
								}
							>
								<SelectTrigger className="w-full md:w-32">
									<SelectValue placeholder="Rows" />
								</SelectTrigger>
								<SelectContent>
									{pageSizeOptions.map((option) => (
										<SelectItem key={option} value={String(option)}>
											{option} per page
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{hasError ? (
						<Alert variant="destructive">
							<AlertTitle>Unable to load ticket types</AlertTitle>
							<AlertDescription>{errorMessage}</AlertDescription>
						</Alert>
					) : null}
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Ticket</TableHead>
									<TableHead>Event</TableHead>
									<TableHead>Pricing</TableHead>
									<TableHead>Inventory</TableHead>
									<TableHead>Sales window</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Updated</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoading ? (
									Array.from({ length: 5 }).map((_, index) => (
										<TableRow key={index}>
											<TableCell>
												<Skeleton className="h-4 w-40" />
												<Skeleton className="mt-2 h-3 w-24" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-4 w-48" />
												<Skeleton className="mt-2 h-3 w-32" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-4 w-24" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-4 w-20" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-4 w-32" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-6 w-20" />
											</TableCell>
											<TableCell className="text-right">
												<Skeleton className="ml-auto h-4 w-24" />
											</TableCell>
										</TableRow>
									))
								) : rows.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={7}
											className="text-center text-muted-foreground"
										>
											No ticket types found. Adjust your filters or try a
											different search.
										</TableCell>
									</TableRow>
								) : (
									rows.map((item: TicketTypeListOutput["items"][number]) => {
										const ticketStatusVariant = statusVariantMap[item.status];
										const capacityLabel =
											item.capacity !== null && item.capacity !== undefined
												? item.capacity.toLocaleString()
												: "Unlimited";
										const maxPerOrderLabel =
											item.maxPerOrder !== null &&
											item.maxPerOrder !== undefined
												? item.maxPerOrder.toLocaleString()
												: "No limit";
										const salesWindow = formatSalesWindow(
											item.salesStartAt,
											item.salesEndAt,
										);
										const updatedAt = item.updatedAt
											? new Date(item.updatedAt)
											: null;

										return (
											<TableRow key={item.id}>
												<TableCell>
													<div className="flex flex-col gap-1">
														<span className="font-medium text-foreground text-sm">
															{item.name}
														</span>
														<span className="text-muted-foreground text-xs">
															ID: {item.id}
														</span>
														{item.description ? (
															<span className="line-clamp-2 text-muted-foreground text-xs">
																{item.description}
															</span>
														) : null}
													</div>
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-1">
														<span className="font-medium text-foreground text-sm">
															{item.event.title}
														</span>
														<span className="text-muted-foreground text-xs">
															Event ID: {item.event.id}
														</span>
														<span className="text-muted-foreground text-xs">
															Status: {item.event.status}
														</span>
													</div>
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-1 text-sm">
														<span>
															{formatCurrency(item.priceCents, item.currency)}
														</span>
														<span className="text-muted-foreground text-xs uppercase">
															{item.currency}
														</span>
													</div>
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-1 text-sm">
														<span>Capacity: {capacityLabel}</span>
														<span>Max/order: {maxPerOrderLabel}</span>
														<span className="text-muted-foreground text-xs">
															Waitlist{" "}
															{item.isWaitlistEnabled ? "enabled" : "disabled"}
														</span>
													</div>
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-1 text-sm">
														<span>{salesWindow.summary}</span>
														{salesWindow.details ? (
															<span className="whitespace-pre-wrap text-muted-foreground text-xs">
																{salesWindow.details}
															</span>
														) : null}
													</div>
												</TableCell>
												<TableCell>
													<Badge variant={ticketStatusVariant}>
														{item.status}
													</Badge>
												</TableCell>
												<TableCell className="text-right text-muted-foreground text-sm">
													{updatedAt
														? `Updated ${formatDistanceToNow(updatedAt, {
																addSuffix: true,
															})}`
														: "—"}
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</div>
					{listData ? (
						<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div className="text-muted-foreground text-sm">
								Showing {summaryStart} to {summaryEnd} of {listData.total}{" "}
								ticket
								{listData.total === 1 ? "" : "s"}
							</div>
							<Pagination>
								<PaginationContent>
									<PaginationItem>
										<PaginationPrevious
											href="#"
											onClick={(event) => {
												event.preventDefault();
												setPage((current) => Math.max(1, current - 1));
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
												setPage((current) => Math.min(totalPages, current + 1));
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
		</AppShell>
	);
}
