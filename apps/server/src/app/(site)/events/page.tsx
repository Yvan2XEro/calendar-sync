"use client";

import "@/styles/big-calendar.css";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import EventsCalendar from "@/components/events/EventsCalendar";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { eventKeys } from "@/lib/query-keys/events";
import { eventsApi, trpcClient } from "@/lib/trpc-client";

const EVENTS_FETCH_LIMIT = 500;

export default function EventsPage() {
	const eventsQuery = useQuery({
		queryKey: eventKeys.recentForUser({ limit: EVENTS_FETCH_LIMIT }),
		queryFn: () => eventsApi.listRecentForUser({ limit: EVENTS_FETCH_LIMIT }),
	});

	const syncMutation = useMutation({
		mutationFn: () =>
			trpcClient.events.syncCalendarForUser.mutate({
				limit: EVENTS_FETCH_LIMIT,
			}),
		onSuccess: (result) => {
			const totalLabel =
				result.total === 0
					? "No events to sync"
					: `Processed ${result.total} event${result.total === 1 ? "" : "s"}`;
			const breakdownParts: string[] = [];
			if (result.created > 0) {
				breakdownParts.push(`${result.created} created`);
			}
			if (result.updated > 0) {
				breakdownParts.push(`${result.updated} updated`);
			}
			if (result.deleted > 0) {
				breakdownParts.push(`${result.deleted} removed`);
			}
			if (result.skipped > 0) {
				breakdownParts.push(`${result.skipped} skipped`);
			}

			const descriptionParts = [totalLabel];
			if (breakdownParts.length > 0) {
				descriptionParts.push(breakdownParts.join(" • "));
			}
			const handledInfo = result.errors.find((error) => error.handled)?.message;
			if (handledInfo) {
				descriptionParts.push(handledInfo);
			}
			if (result.failed > 0) {
				descriptionParts.push(`${result.failed} failed`);
			}

			const description = descriptionParts.join(" • ");

			if (result.failed > 0) {
				const errorDetail = result.errors.at(0)?.message;
				const errorDescription = errorDetail
					? `${description} • ${errorDetail}`
					: description;
				toast.error("Some events failed to sync", {
					description: errorDescription,
				});
			} else {
				toast.success("Calendars synchronized", {
					description,
				});
			}

			void eventsQuery.refetch();
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Unable to sync calendars",
			);
		},
	});

	const handleSync = React.useCallback(() => {
		syncMutation.mutate();
	}, [syncMutation]);

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Dashboard", href: "/dashboard" },
				{ label: "Events", current: true },
			]}
			headerRight={
				<>
					<Button
						variant="outline"
						size="sm"
						className="whitespace-nowrap"
						onClick={handleSync}
						disabled={syncMutation.isPending}
					>
						{syncMutation.isPending ? (
							<span className="inline-flex items-center gap-2">
								<Loader2 className="size-4 animate-spin" aria-hidden />
								Syncing…
							</span>
						) : (
							"Sync with connected calendars"
						)}
					</Button>
					<UserAvatar />
				</>
			}
		>
			<RedirectToSignIn />
			<EventsCalendar
				events={eventsQuery.data ?? []}
				isLoading={eventsQuery.isLoading}
				isFetching={eventsQuery.isFetching}
				isError={eventsQuery.isError}
				onRetry={eventsQuery.refetch}
			/>
		</AppShell>
	);
}
