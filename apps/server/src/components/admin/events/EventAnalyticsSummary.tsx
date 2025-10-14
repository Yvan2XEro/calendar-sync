"use client";

import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { eventKeys } from "@/lib/query-keys/events";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

const numberFormatter = new Intl.NumberFormat("en-US");

function formatCurrency(cents: number, currency: string) {
	const formatter = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
		maximumFractionDigits: 0,
	});
	return formatter.format(cents / 100);
}

function formatPercent(value: number) {
	return `${Math.round(value * 100)}%`;
}

type SparklineProps = {
	registrations: number[];
	checkIns: number[];
};

function Sparkline({ registrations, checkIns }: SparklineProps) {
	const width = 240;
	const height = 80;
	const maxValue = Math.max(
		1,
		registrations.reduce((acc, value) => Math.max(acc, value), 0),
		checkIns.reduce((acc, value) => Math.max(acc, value), 0),
	);
	const toPath = (values: number[]) => {
		if (values.length === 0) return `M0 ${height} L${width} ${height}`;
		const step = values.length === 1 ? width : width / (values.length - 1);
		return values
			.map((value, index) => {
				const x = index * step;
				const y = height - (value / maxValue) * height;
				const sanitizedY = Number.isFinite(y) ? y : height;
				return `${index === 0 ? "M" : "L"}${x},${sanitizedY}`;
			})
			.join(" ");
	};
	const registrationPath = toPath(registrations);
	const checkInPath = toPath(checkIns);
	return (
		<svg
			role="img"
			aria-label="Registrations versus check-ins sparkline"
			focusable="false"
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className="overflow-visible"
		>
			<title>Registrations and check-ins over time</title>
			<g className="text-primary">
				<path
					d={registrationPath}
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>
			<g className="text-emerald-500 dark:text-emerald-400">
				<path
					d={checkInPath}
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>
		</svg>
	);
}

type EventAnalyticsSummaryProps = {
	eventId: string;
};

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AnalyticsOverviewOutput = RouterOutputs["events"]["analytics"]["overview"];
type AnalyticsTimeseriesOutput =
	RouterOutputs["events"]["analytics"]["timeseries"];

export function EventAnalyticsSummary({ eventId }: EventAnalyticsSummaryProps) {
	const overviewQuery = useQuery<AnalyticsOverviewOutput>({
		queryKey: eventKeys.analytics.overview(eventId),
		queryFn: () => trpcClient.events.analytics.overview.query({ eventId }),
		enabled: Boolean(eventId),
	});
	const timeseriesQuery = useQuery<AnalyticsTimeseriesOutput>({
		queryKey: eventKeys.analytics.timeseries(eventId, { interval: "day" }),
		queryFn: () =>
			trpcClient.events.analytics.timeseries.query({
				eventId,
				interval: "day",
			}),
		enabled: Boolean(eventId),
	});

	const registrationsSeries = useMemo(() => {
		return (
			timeseriesQuery.data?.points.map((point) => point.registrations) ?? []
		);
	}, [timeseriesQuery.data]);
	const checkInsSeries = useMemo(() => {
		return timeseriesQuery.data?.points.map((point) => point.checkIns) ?? [];
	}, [timeseriesQuery.data]);

	if (overviewQuery.isLoading) {
		return (
			<div className="grid gap-4 md:grid-cols-3">
				{[0, 1, 2].map((index) => (
					<Card key={index}>
						<CardHeader>
							<CardTitle>
								<Skeleton className="h-6 w-32" />
							</CardTitle>
							<CardDescription>
								<Skeleton className="h-4 w-48" />
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							<Skeleton className="h-10 w-24" />
							<Skeleton className="h-4 w-40" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (overviewQuery.isError || !overviewQuery.data) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Analytics unavailable</CardTitle>
					<CardDescription>
						We couldn’t load the latest metrics for this event. Try again later.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	const overview = overviewQuery.data;
	const revenueCurrency = overview.revenue.currency ?? "usd";
	const totalRegistrations = overview.totals.registrations;
	const attendanceRate = overview.attendanceRate;
	const revenueValue = overview.revenue.cents;

	const totalCheckedIn = overview.totals.checkedIn;
	const waitlisted = overview.totals.waitlisted;
	const noShow = overview.totals.noShow;
	const conversionRate = overview.orders.conversionRate;

	return (
		<div className="space-y-4">
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle>Total registrations</CardTitle>
						<CardDescription>
							Includes confirmed and reserved attendees for this event.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="font-semibold text-3xl">
							{numberFormatter.format(totalRegistrations)}
						</div>
						<p className="text-muted-foreground text-sm">
							Checked-in: {numberFormatter.format(totalCheckedIn)} · Waitlist:{" "}
							{numberFormatter.format(waitlisted)}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Attendance health</CardTitle>
						<CardDescription>
							Real-time participation rates from on-site check-ins.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="font-semibold text-3xl">
							{formatPercent(attendanceRate)}
						</div>
						<p className="text-muted-foreground text-sm">
							No-shows recorded: {numberFormatter.format(noShow)}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Revenue &amp; conversion</CardTitle>
						<CardDescription>
							Confirmed orders and payment conversion trends.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="font-semibold text-3xl">
							{formatCurrency(revenueValue, revenueCurrency)}
						</div>
						<p className="text-muted-foreground text-sm">
							Conversion rate: {formatPercent(conversionRate)}
						</p>
					</CardContent>
				</Card>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Daily momentum</CardTitle>
					<CardDescription>
						Registrations (blue) versus check-ins (green) across the last 30
						days.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					{timeseriesQuery.isLoading ? (
						<Skeleton className="h-24 w-full md:w-64" />
					) : (
						<Sparkline
							registrations={registrationsSeries}
							checkIns={checkInsSeries}
						/>
					)}
					<div className="text-muted-foreground text-sm">
						<div>
							Confirmed orders:{" "}
							{numberFormatter.format(overview.orders.confirmed)}
						</div>
						<div>
							Total orders: {numberFormatter.format(overview.orders.total)}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
