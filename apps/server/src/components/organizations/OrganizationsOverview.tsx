"use client";

import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { format } from "date-fns";
import {
	AlertCircle,
	Building2,
	CalendarDays,
	Loader2,
	Users,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { orgsKeys } from "@/lib/query-keys/orgs";
import { orgsApi } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import type { AppRouter } from "@/routers";

const ORGANIZATION_PAGE_SIZE = 6;

type RouterOutputs = inferRouterOutputs<AppRouter>;
type OrgListResult = RouterOutputs["orgs"]["listForUser"];
type JoinedPage = Extract<OrgListResult, { segment: "joined" }>;
type DiscoverPage = Extract<OrgListResult, { segment: "discover" }>;
type JoinedOrganization = JoinedPage["items"][number];
type DiscoverOrganization = DiscoverPage["items"][number];

type JoinVariables = {
	organizationId: string;
	optimisticOrg: DiscoverOrganization;
};
type JoinContext = {
	previousJoined?: InfiniteData<JoinedPage>;
	previousDiscover?: InfiniteData<DiscoverPage>;
};

export type OrganizationsOverviewProps = {
	title?: React.ReactNode;
	description?: React.ReactNode;
	searchPlaceholder?: string;
	className?: string;
};

export function OrganizationsOverview({
	title = "Organizations",
	description = "Manage the workspaces you already belong to or discover new ones to follow.",
	searchPlaceholder = "Search organizations…",
	className,
}: OrganizationsOverviewProps) {
	const [search, setSearch] = React.useState("");
	const deferredSearch = React.useDeferredValue(search);

	const joinedFilters = React.useMemo(
		() => ({
			segment: "joined" as const,
			search:
				deferredSearch.trim().length > 0 ? deferredSearch.trim() : undefined,
			limit: ORGANIZATION_PAGE_SIZE,
			sort: "recent" as const,
		}),
		[deferredSearch],
	);

	const discoverFilters = React.useMemo(
		() => ({
			segment: "discover" as const,
			search:
				deferredSearch.trim().length > 0 ? deferredSearch.trim() : undefined,
			limit: ORGANIZATION_PAGE_SIZE,
			sort: "name-asc" as const,
		}),
		[deferredSearch],
	);

	const joinedKey = React.useMemo(
		() =>
			orgsKeys.list({
				segment: joinedFilters.segment,
				search: joinedFilters.search ?? null,
				limit: joinedFilters.limit ?? null,
				sort: joinedFilters.sort ?? null,
			}),
		[joinedFilters],
	);

	const discoverKey = React.useMemo(
		() =>
			orgsKeys.list({
				segment: discoverFilters.segment,
				search: discoverFilters.search ?? null,
				limit: discoverFilters.limit ?? null,
				sort: discoverFilters.sort ?? null,
			}),
		[discoverFilters],
	);

	const joinedQuery = useInfiniteQuery<JoinedPage>({
		queryKey: joinedKey,
		initialPageParam: 1,
		queryFn: ({ pageParam }) =>
			orgsApi.listForUser({
				...joinedFilters,
				page: typeof pageParam === "number" ? pageParam : 1,
			}),
		getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
	});

	const discoverQuery = useInfiniteQuery<DiscoverPage>({
		queryKey: discoverKey,
		initialPageParam: 1,
		queryFn: ({ pageParam }) =>
			orgsApi.listForUser({
				...discoverFilters,
				page: typeof pageParam === "number" ? pageParam : 1,
			}),
		getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
	});

	const queryClient = useQueryClient();
	const joinMutation = useJoinOrganizationMutation({
		queryClient,
		joinedKey,
		discoverKey,
		joinedFilters,
	});

	const handleJoin = React.useCallback(
		(organization: DiscoverOrganization) => {
			joinMutation.mutate({
				organizationId: organization.id,
				optimisticOrg: organization,
			});
		},
		[joinMutation],
	);

	const joinedItems = React.useMemo(
		() => joinedQuery.data?.pages.flatMap((page) => page.items) ?? [],
		[joinedQuery.data],
	);
	const discoverItems = React.useMemo(
		() => discoverQuery.data?.pages.flatMap((page) => page.items) ?? [],
		[discoverQuery.data],
	);

	return (
		<section className={cn("space-y-4", className)}>
			{title ? (
				<header className="space-y-1">
					<h2 className="font-semibold text-2xl tracking-tight">{title}</h2>
					{description ? (
						<p className="text-muted-foreground text-sm">{description}</p>
					) : null}
				</header>
			) : null}

			<Tabs defaultValue="joined" className="space-y-4">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<TabsList>
						<TabsTrigger value="joined">Joined</TabsTrigger>
						<TabsTrigger value="discover">Discover</TabsTrigger>
					</TabsList>
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder={searchPlaceholder}
						className="md:max-w-xs"
						aria-label="Search organizations"
					/>
				</div>
				<TabsContent value="joined" className="space-y-4">
					{joinedQuery.isLoading ? (
						<OrganizationSkeletonGrid />
					) : joinedQuery.isError ? (
						<ErrorState
							message="We couldn’t load your organizations."
							onRetry={joinedQuery.refetch}
						/>
					) : joinedItems.length === 0 ? (
						<EmptyState
							title="No organizations yet"
							description="You haven’t joined any organizations. Discover new workspaces to collaborate with."
						/>
					) : (
						<React.Fragment>
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								{joinedItems.map((org) => (
									<JoinedOrganizationCard key={org.id} organization={org} />
								))}
							</div>
							{joinedQuery.hasNextPage ? (
								<Button
									onClick={() => joinedQuery.fetchNextPage()}
									disabled={joinedQuery.isFetchingNextPage}
								>
									{joinedQuery.isFetchingNextPage ? "Loading…" : "Load more"}
								</Button>
							) : null}
						</React.Fragment>
					)}
				</TabsContent>
				<TabsContent value="discover" className="space-y-4">
					{discoverQuery.isLoading ? (
						<OrganizationSkeletonGrid />
					) : discoverQuery.isError ? (
						<ErrorState
							message="We couldn’t load suggested organizations."
							onRetry={discoverQuery.refetch}
						/>
					) : discoverItems.length === 0 ? (
						<EmptyState
							title="Nothing to discover"
							description="You’re already part of every organization that matches your filters."
						/>
					) : (
						<React.Fragment>
							{joinMutation.isError ? (
								<Alert variant="destructive">
									<AlertCircle className="size-4" />
									<AlertTitle>Join failed</AlertTitle>
									<AlertDescription>
										Something went wrong while joining the organization. Please
										try again.
									</AlertDescription>
								</Alert>
							) : null}
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								{discoverItems.map((org) => (
									<DiscoverOrganizationCard
										key={org.id}
										organization={org}
										onJoin={handleJoin}
										isJoining={
											joinMutation.isPending &&
											joinMutation.variables?.organizationId === org.id
										}
									/>
								))}
							</div>
							{discoverQuery.hasNextPage ? (
								<Button
									onClick={() => discoverQuery.fetchNextPage()}
									disabled={discoverQuery.isFetchingNextPage}
								>
									{discoverQuery.isFetchingNextPage ? "Loading…" : "Load more"}
								</Button>
							) : null}
						</React.Fragment>
					)}
				</TabsContent>
			</Tabs>
		</section>
	);
}

function useJoinOrganizationMutation({
	queryClient,
	joinedKey,
	discoverKey,
	joinedFilters,
}: {
	queryClient: ReturnType<typeof useQueryClient>;
	joinedKey: ReturnType<typeof orgsKeys.list>;
	discoverKey: ReturnType<typeof orgsKeys.list>;
	joinedFilters: {
		segment: "joined";
		limit: number;
		sort: JoinedPage["sort"];
	} & Record<string, unknown>;
}) {
	return useMutation<JoinedOrganization, unknown, JoinVariables, JoinContext>({
		mutationFn: ({ organizationId }) => orgsApi.join({ organizationId }),
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey: joinedKey });
			await queryClient.cancelQueries({ queryKey: discoverKey });

			const previousJoined =
				queryClient.getQueryData<InfiniteData<JoinedPage>>(joinedKey);
			const previousDiscover =
				queryClient.getQueryData<InfiniteData<DiscoverPage>>(discoverKey);

			const optimisticJoined: JoinedOrganization = {
				id: variables.optimisticOrg.id,
				name: variables.optimisticOrg.name,
				slug: variables.optimisticOrg.slug,
				logo: variables.optimisticOrg.logo,
				metadata: variables.optimisticOrg.metadata,
				role: "member",
				joinedAt: new Date().toISOString(),
			};

			queryClient.setQueryData<InfiniteData<JoinedPage>>(
				joinedKey,
				(existing) => {
					if (!existing) {
						return {
							pages: [
								{
									items: [optimisticJoined],
									segment: joinedFilters.segment,
									page: 1,
									limit: joinedFilters.limit,
									sort: joinedFilters.sort,
									nextPage: null,
								},
							],
							pageParams: [1],
						} satisfies InfiniteData<JoinedPage>;
					}

					const [firstPage, ...restPages] = existing.pages;
					const updatedFirstPage: JoinedPage = {
						...firstPage,
						items: [
							optimisticJoined,
							...firstPage.items.filter(
								(item: JoinedOrganization) => item.id !== optimisticJoined.id,
							),
						],
					};

					return {
						...existing,
						pages: [
							updatedFirstPage,
							...restPages.map((page: JoinedPage) => ({
								...page,
								items: page.items.filter(
									(item: JoinedOrganization) => item.id !== optimisticJoined.id,
								),
							})),
						],
					};
				},
			);

			queryClient.setQueryData<InfiniteData<DiscoverPage>>(
				discoverKey,
				(existing) => {
					if (!existing) return existing;
					return {
						...existing,
						pages: existing.pages.map((page: DiscoverPage) => ({
							...page,
							items: page.items.filter(
								(item: DiscoverOrganization) =>
									item.id !== variables.optimisticOrg.id,
							),
						})),
					};
				},
			);

			return { previousJoined, previousDiscover } satisfies JoinContext;
		},
		onError: (_error, _variables, context) => {
			if (context?.previousJoined) {
				queryClient.setQueryData(joinedKey, context.previousJoined);
			}
			if (context?.previousDiscover) {
				queryClient.setQueryData(discoverKey, context.previousDiscover);
			}
		},
		onSuccess: (result) => {
			queryClient.setQueryData<InfiniteData<JoinedPage>>(
				joinedKey,
				(existing) => {
					if (!existing) {
						return {
							pages: [
								{
									items: [result],
									segment: joinedFilters.segment,
									page: 1,
									limit: joinedFilters.limit,
									sort: joinedFilters.sort,
									nextPage: null,
								},
							],
							pageParams: [1],
						} satisfies InfiniteData<JoinedPage>;
					}

					return {
						...existing,
						pages: existing.pages.map((page: JoinedPage, index) =>
							index === 0
								? {
										...page,
										items: [
											result,
											...page.items.filter(
												(item: JoinedOrganization) => item.id !== result.id,
											),
										],
									}
								: {
										...page,
										items: page.items.filter(
											(item: JoinedOrganization) => item.id !== result.id,
										),
								},
						),
					};
				},
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: joinedKey });
			queryClient.invalidateQueries({ queryKey: discoverKey });
		},
	});
}

function OrganizationSkeletonGrid() {
	return (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{Array.from({ length: 3 }).map((_, index) => (
				<Card key={index} className="flex h-full flex-col">
					<CardHeader className="space-y-2">
						<div className="flex items-start gap-3">
							<Skeleton className="h-10 w-10 rounded-full" />
							<div className="min-w-0 flex-1 space-y-2">
								<div className="flex items-center justify-between gap-3">
									<Skeleton className="h-5 w-3/4" />
									<Skeleton className="h-5 w-16" />
								</div>
								<Skeleton className="h-4 w-2/3" />
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-3">
						<Skeleton className="h-3 w-1/4" />
						<Skeleton className="h-9 w-24" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function EmptyState({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="rounded-lg border border-dashed p-8 text-center">
			<h3 className="font-semibold text-lg">{title}</h3>
			<p className="mt-2 text-muted-foreground text-sm">{description}</p>
		</div>
	);
}

function ErrorState({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<Alert variant="destructive" className="flex flex-col gap-3 text-left">
			<div className="flex items-center gap-2">
				<AlertCircle className="size-4" />
				<AlertTitle>Something went wrong</AlertTitle>
			</div>
			<AlertDescription className="space-y-3">
				<p>{message}</p>
				<Button variant="outline" size="sm" onClick={onRetry}>
					Try again
				</Button>
			</AlertDescription>
		</Alert>
	);
}

function JoinedOrganizationCard({
	organization,
}: {
	organization: JoinedOrganization;
}) {
	const tagline =
		getOrganizationTagline(organization.metadata) ??
		"Stay in sync with upcoming activity.";
	const initials = getOrganizationInitials(organization.name);
	const logoSrc =
		typeof organization.logo === "string" && organization.logo.trim().length > 0
			? organization.logo
			: undefined;
	return (
		<Card className="flex h-full flex-col">
			<CardHeader className="space-y-2">
				<div className="flex items-start gap-3">
					<Avatar className="h-10 w-10 border">
						<AvatarImage src={logoSrc} alt={`${organization.name} logo`} />
						<AvatarFallback className="bg-muted text-foreground">
							{initials ? (
								<span className="font-medium uppercase">{initials}</span>
							) : (
								<Building2 className="size-4" aria-hidden />
							)}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex items-center justify-between gap-3">
							<CardTitle className="truncate text-lg">
								{organization.name}
							</CardTitle>
							<Badge variant="outline" className="shrink-0 text-xs uppercase">
								{organization.role}
							</Badge>
						</div>
						<CardDescription className="line-clamp-2">
							{tagline}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="mt-auto space-y-3 text-muted-foreground text-sm">
				<div className="flex items-center gap-2">
					<CalendarDays className="size-4" aria-hidden />
					<span>Joined {formatDate(organization.joinedAt)}</span>
				</div>
				<Button asChild variant="ghost" size="sm" className="w-fit px-0">
					<Link href={`/organizations/${organization.slug}` as any}>
						Open workspace
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}

function DiscoverOrganizationCard({
	organization,
	onJoin,
	isJoining,
}: {
	organization: DiscoverOrganization;
	onJoin: (org: DiscoverOrganization) => void;
	isJoining: boolean;
}) {
	const tagline =
		getOrganizationTagline(organization.metadata) ??
		"Add this workspace to keep tabs on new events.";
	const membersLabel = new Intl.NumberFormat().format(
		organization.membersCount ?? 0,
	);
	const initials = getOrganizationInitials(organization.name);
	const logoSrc =
		typeof organization.logo === "string" && organization.logo.trim().length > 0
			? organization.logo
			: undefined;

	return (
		<Card className="flex h-full flex-col">
			<CardHeader className="space-y-2">
				<div className="flex items-start gap-3">
					<Avatar className="h-10 w-10 border">
						<AvatarImage src={logoSrc} alt={`${organization.name} logo`} />
						<AvatarFallback className="bg-muted text-foreground">
							{initials ? (
								<span className="font-medium uppercase">{initials}</span>
							) : (
								<Building2 className="size-4" aria-hidden />
							)}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1 space-y-1">
						<CardTitle className="truncate text-lg">
							{organization.name}
						</CardTitle>
						<CardDescription className="line-clamp-2">
							{tagline}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="mt-auto space-y-4 text-muted-foreground text-sm">
				<div className="flex items-center gap-2">
					<Users className="size-4" aria-hidden />
					<span>{membersLabel} members</span>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() => onJoin(organization)}
						disabled={isJoining}
						aria-busy={isJoining}
					>
						{isJoining ? (
							<React.Fragment>
								<Loader2 className="mr-2 size-4 animate-spin" /> Joining…
							</React.Fragment>
						) : (
							"Join organization"
						)}
					</Button>
					<Button asChild variant="outline">
						<Link href={`/organizations/${organization.slug}` as any}>
							View details
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function formatDate(date: string | Date | null | undefined) {
	if (!date) return "Unknown";
	const value = typeof date === "string" ? new Date(date) : date;
	try {
		return format(value, "MMM d, yyyy");
	} catch {
		return "Unknown";
	}
}

function getOrganizationTagline(
	metadata: Record<string, unknown> | null | undefined,
) {
	if (!metadata) return null;
	const tagline = metadata.tagline;
	if (typeof tagline === "string" && tagline.trim().length > 0) {
		return tagline;
	}
	const description = metadata.description;
	if (typeof description === "string" && description.trim().length > 0) {
		return description;
	}
	return null;
}

function getOrganizationInitials(name: string | null | undefined) {
	if (!name) return null;
	const trimmed = name.trim();
	if (!trimmed) return null;
	const parts = trimmed.split(/\s+/);
	const [first, second] = parts;
	const initials = `${first?.[0] ?? ""}${second?.[0] ?? ""}`.trim();
	if (initials.length === 0) return null;
	return initials.slice(0, 2).toUpperCase();
}
