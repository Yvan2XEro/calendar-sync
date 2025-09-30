"use client";

import "@/styles/big-calendar.css";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import EventsCalendar from "@/components/events/EventsCalendar";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { eventKeys } from "@/lib/query-keys/events";
import { eventsApi } from "@/lib/trpc-client";

const EVENTS_FETCH_LIMIT = 500;

export default function EventsPage() {
	const eventsQuery = useQuery({
		queryKey: eventKeys.recentForUser({ limit: EVENTS_FETCH_LIMIT }),
		queryFn: () => eventsApi.listRecentForUser({ limit: EVENTS_FETCH_LIMIT }),
	});

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Home", href: "/" },
				{ label: "Events", current: true },
			]}
			headerRight={<UserAvatar />}
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
