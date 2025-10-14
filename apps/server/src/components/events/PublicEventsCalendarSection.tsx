"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import EventsCalendar from "@/components/events/EventsCalendar";
import { eventKeys } from "@/lib/query-keys/events";
import { eventsApi } from "@/lib/trpc-client";
import type { UpcomingEvent } from "@/types/events";

type PublicEventsCalendarSectionProps = {
	initialEvents: UpcomingEvent[];
	limit: number;
};

export function PublicEventsCalendarSection({
	initialEvents,
	limit,
}: PublicEventsCalendarSectionProps) {
	const queryFn = React.useCallback(
		() => eventsApi.listUpcomingPublic({ limit }),
		[limit],
	);

	const eventsQuery = useQuery({
		queryKey: eventKeys.publicUpcoming({ limit }),
		queryFn,
		initialData: initialEvents,
		initialDataUpdatedAt: initialEvents.length ? Date.now() : undefined,
	});

	return (
		<EventsCalendar
			events={eventsQuery.data ?? []}
			isLoading={eventsQuery.isLoading && !eventsQuery.data}
			isFetching={eventsQuery.isFetching}
			isError={eventsQuery.isError}
			onRetry={() => {
				void eventsQuery.refetch();
			}}
		/>
	);
}
