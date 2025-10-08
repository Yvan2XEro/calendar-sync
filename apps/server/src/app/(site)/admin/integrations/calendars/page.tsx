"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import AppShell from "@/components/layout/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { calendarConnectionKeys } from "@/lib/query-keys/calendar-connections";
import { trpcClient } from "@/lib/trpc-client";

const adminOrgRoles = new Set(["admin", "owner"]);

type ConnectionsOutput = Awaited<
	ReturnType<typeof trpcClient.adminCalendarConnections.list.query>
>;

type ConnectionRecord = ConnectionsOutput[number];

function formatTimestamp(value: string | null | undefined) {
	if (!value) return "Never";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function StatusBadge({ status }: { status: ConnectionRecord["status"] }) {
	const variant =
		status === "connected"
			? "default"
			: status === "error"
				? "destructive"
				: "secondary";
	return <Badge variant={variant}>{status}</Badge>;
}

export default function AdminCalendarConnectionsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const queryClient = useQueryClient();
	const initialSlug = searchParams.get("organization");
	const statusParam = searchParams.get("status");
	const messageParam = searchParams.get("message");
	const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);
	const [calendarDrafts, setCalendarDrafts] = useState<Record<string, string>>(
		{},
	);
	const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
	const [updatingId, setUpdatingId] = useState<string | null>(null);

	useEffect(() => {
		if (initialSlug) {
			setSelectedSlug(initialSlug);
		}
	}, [initialSlug]);

	useEffect(() => {
		if (!statusParam) return;
		if (statusParam === "success") {
			toast.success(messageParam ?? "Calendar connected");
		} else if (statusParam === "error") {
			toast.error(messageParam ?? "Unable to connect calendar");
		}

		const next = new URL(window.location.href);
		next.searchParams.delete("status");
		next.searchParams.delete("message");
		router.replace(
			`${next.pathname}${next.search ? `?${next.searchParams.toString()}` : ""}`,
			{
				scroll: false,
			},
		);
	}, [statusParam, messageParam, router]);

	const orgsQuery = useQuery({
		queryKey: ["adminOrganizations", "joined"],
		queryFn: () =>
			trpcClient.orgs.listForUser.query({
				segment: "joined",
				limit: 50,
			}),
	});

	const adminOrganizations = useMemo(() => {
		if (!orgsQuery.data) return [] as typeof orgsQuery.data.items;
		return orgsQuery.data.items.filter((org) => adminOrgRoles.has(org.role));
	}, [orgsQuery.data]);

	useEffect(() => {
		if (selectedSlug) return;
		const first = adminOrganizations.at(0);
		if (!first) return;
		setSelectedSlug(first.slug);
		const next = new URL(window.location.href);
		next.searchParams.set("organization", first.slug);
		next.searchParams.delete("status");
		next.searchParams.delete("message");
		router.replace(
			`${next.pathname}${next.search ? `?${next.searchParams.toString()}` : ""}`,
			{
				scroll: false,
			},
		);
	}, [selectedSlug, adminOrganizations, router]);

	const connectionsQuery = useQuery({
		queryKey: calendarConnectionKeys.list(selectedSlug ?? undefined),
		queryFn: () => {
			if (!selectedSlug) {
				throw new Error("Organization slug is required");
			}
			return trpcClient.adminCalendarConnections.list.query({
				slug: selectedSlug,
			});
		},
		enabled: Boolean(selectedSlug),
	});

	useEffect(() => {
		if (!connectionsQuery.data) return;
		setCalendarDrafts((prev) => {
			const next: Record<string, string> = {};
			for (const connection of connectionsQuery.data) {
				next[connection.id] = connection.calendarId ?? "";
			}
			return next;
		});
	}, [connectionsQuery.data]);

	const connectDisabled = !selectedSlug;

	const disconnectMutation = useMutation({
		mutationFn: (connectionId: string) => {
			if (!selectedSlug) throw new Error("Organization slug is required");
			return trpcClient.adminCalendarConnections.disconnect.mutate({
				slug: selectedSlug,
				connectionId,
			});
		},
		onMutate: (connectionId) => {
			setDisconnectingId(connectionId);
		},
		onSuccess: () => {
			toast.success("Calendar disconnected");
			queryClient.invalidateQueries({
				queryKey: calendarConnectionKeys.list(selectedSlug ?? undefined),
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to disconnect calendar",
			);
		},
		onSettled: () => {
			setDisconnectingId(null);
		},
	});

	const updateCalendarMutation = useMutation({
		mutationFn: (payload: { connectionId: string; calendarId: string }) => {
			if (!selectedSlug) throw new Error("Organization slug is required");
			return trpcClient.adminCalendarConnections.updateCalendar.mutate({
				slug: selectedSlug,
				connectionId: payload.connectionId,
				calendarId: payload.calendarId,
			});
		},
		onMutate: (payload) => {
			setUpdatingId(payload.connectionId);
		},
		onSuccess: () => {
			toast.success("Calendar identifier updated");
			queryClient.invalidateQueries({
				queryKey: calendarConnectionKeys.list(selectedSlug ?? undefined),
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to update calendar",
			);
		},
		onSettled: () => {
			setUpdatingId(null);
		},
	});

	const handleOrganizationChange = (slug: string) => {
		setSelectedSlug(slug);
		const next = new URL(window.location.href);
		if (slug) {
			next.searchParams.set("organization", slug);
		} else {
			next.searchParams.delete("organization");
		}
		next.searchParams.delete("status");
		next.searchParams.delete("message");
		router.replace(
			`${next.pathname}${next.search ? `?${next.searchParams.toString()}` : ""}`,
			{
				scroll: false,
			},
		);
	};

	const handleConnect = () => {
		if (!selectedSlug) return;
		window.location.href = `/api/integrations/google-calendar/start?organization=${encodeURIComponent(selectedSlug)}`;
	};

	const connections = connectionsQuery.data ?? [];
	const isLoadingConnections = connectionsQuery.isLoading;
	const organizationSelected = Boolean(selectedSlug);

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{
					label: "Integrations",
					href: "/admin/integrations/calendars",
					current: true,
				},
			]}
		>
			<div className="space-y-6 p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="font-semibold text-2xl">Calendar connections</h1>
						<p className="text-muted-foreground">
							Connect Google Calendars for each organization and monitor sync
							health.
						</p>
					</div>
					<Button onClick={handleConnect} disabled={connectDisabled}>
						Connect Google Calendar
					</Button>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Select organization</CardTitle>
						<CardDescription>
							Choose an organization to view and manage its calendar
							connections.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{orgsQuery.isLoading ? (
							<Skeleton className="h-10 w-64" />
						) : adminOrganizations.length === 0 ? (
							<Alert>
								<AlertTitle>No admin organizations</AlertTitle>
								<AlertDescription>
									You are not an administrator for any organization. Ask an
									owner to grant access.
								</AlertDescription>
							</Alert>
						) : (
							<div className="max-w-xs">
								<Label htmlFor="organization-select">Organization</Label>
								<Select
									value={selectedSlug ?? undefined}
									onValueChange={(value) => handleOrganizationChange(value)}
								>
									<SelectTrigger id="organization-select" className="mt-1">
										<SelectValue placeholder="Select organization" />
									</SelectTrigger>
									<SelectContent>
										{adminOrganizations.map((org) => (
											<SelectItem key={org.slug} value={org.slug}>
												{org.name} ({org.slug})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</CardContent>
				</Card>

				{!organizationSelected ? (
					<Alert>
						<AlertTitle>Select an organization</AlertTitle>
						<AlertDescription>
							Choose an organization to review its calendar connections.
						</AlertDescription>
					</Alert>
				) : (
					<Card>
						<CardHeader>
							<CardTitle>Connections</CardTitle>
							<CardDescription>
								Review connection status and manage calendar identifiers.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{isLoadingConnections ? (
								<div className="space-y-4">
									{Array.from({ length: 2 }).map((_, index) => (
										<Skeleton key={index} className="h-28 w-full" />
									))}
								</div>
							) : connections.length === 0 ? (
								<Alert>
									<AlertTitle>No connections found</AlertTitle>
									<AlertDescription>
										Use the connect button above to authorize Google Calendar
										for this organization.
									</AlertDescription>
								</Alert>
							) : (
								connections.map((connection) => {
									const draftValue = calendarDrafts[connection.id] ?? "";
									const isDisconnecting =
										disconnectMutation.isPending &&
										disconnectingId === connection.id;
									const isUpdating =
										updateCalendarMutation.isPending &&
										updatingId === connection.id;
									return (
										<Card key={connection.id} className="border">
											<CardHeader>
												<div className="flex flex-wrap items-start justify-between gap-2">
													<div>
														<CardTitle className="flex items-center gap-2 text-lg">
															<span className="capitalize">
																{connection.providerType}
															</span>
															<StatusBadge status={connection.status} />
														</CardTitle>
														<CardDescription>
															{connection.externalAccountId
																? `Connected as ${connection.externalAccountId}`
																: "No external account metadata available."}
														</CardDescription>
													</div>
													{connection.hasCredentials ? (
														<Badge variant="outline">Credentials stored</Badge>
													) : (
														<Badge variant="destructive">
															Credentials missing
														</Badge>
													)}
												</div>
											</CardHeader>
											<CardContent className="space-y-3">
												<div className="grid gap-2 md:grid-cols-2">
													<div>
														<Label htmlFor={`calendar-${connection.id}`}>
															Calendar identifier
														</Label>
														<Input
															id={`calendar-${connection.id}`}
															value={draftValue}
															onChange={(event) =>
																setCalendarDrafts((prev) => ({
																	...prev,
																	[connection.id]: event.target.value,
																}))
															}
															placeholder="primary"
														/>
													</div>
													<div className="text-muted-foreground text-sm">
														<p>
															Last synced:{" "}
															{formatTimestamp(connection.lastSyncedAt)}
														</p>
														{connection.failureReason ? (
															<p className="text-destructive">
																Last error: {connection.failureReason}
															</p>
														) : null}
													</div>
												</div>
											</CardContent>
											<CardFooter className="flex flex-wrap gap-2">
												<Button
													variant="outline"
													disabled={
														isUpdating || draftValue.trim().length === 0
													}
													onClick={() =>
														updateCalendarMutation.mutate({
															connectionId: connection.id,
															calendarId: draftValue.trim(),
														})
													}
												>
													Save calendar ID
												</Button>
												<Button
													variant="destructive"
													disabled={isDisconnecting}
													onClick={() =>
														disconnectMutation.mutate(connection.id)
													}
												>
													Disconnect
												</Button>
											</CardFooter>
										</Card>
									);
								})
							)}
						</CardContent>
					</Card>
				)}
			</div>
		</AppShell>
	);
}
