"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { digestKeys } from "@/lib/query-keys/digests";
import { trpcClient } from "@/lib/trpc-client";

const segmentDescriptions: Record<string, string> = {
	joined: "Members receive highlights from organizations they belong to.",
	discover: "Showcase recommended events from new organizations.",
};

type Schedule = Awaited<
	ReturnType<typeof trpcClient.adminDigests.listSchedules.query>
>[number];

type Draft = {
	enabled: boolean;
	cadenceHours: string;
	lookaheadDays: string;
};

function formatTimestamp(value: string | null) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return formatDistanceToNowStrict(date, { addSuffix: true });
}

function computeNextSend(schedule: Schedule) {
	if (!schedule.lastSentAt) return null;
	const base = new Date(schedule.lastSentAt);
	if (Number.isNaN(base.getTime())) return null;
	const next = new Date(
		base.getTime() + schedule.cadenceHours * 60 * 60 * 1000,
	);
	return next.toISOString();
}

export default function AdminDigestsPage() {
	const queryClient = useQueryClient();
	const scheduleQuery = useQuery({
		queryKey: digestKeys.schedules(),
		queryFn: () => trpcClient.adminDigests.listSchedules.query(),
	});
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const placeholders = ["primary", "secondary"] as const;

	useEffect(() => {
		if (!scheduleQuery.data) return;
		const mapped: Record<string, Draft> = {};
		for (const schedule of scheduleQuery.data) {
			mapped[schedule.segment] = {
				enabled: schedule.enabled,
				cadenceHours: schedule.cadenceHours.toString(),
				lookaheadDays: schedule.lookaheadDays.toString(),
			} satisfies Draft;
		}
		setDrafts(mapped);
	}, [scheduleQuery.data]);

	const mutation = useMutation({
		mutationFn: (input: {
			segment: Schedule["segment"];
			enabled: boolean;
			cadenceHours: number;
			lookaheadDays: number;
		}) => trpcClient.adminDigests.updateSchedule.mutate(input),
		onSuccess: (updated) => {
			queryClient.invalidateQueries({ queryKey: digestKeys.schedules() });
			toast.success("Digest schedule updated", {
				description: `${updated.segment} cadence saved.`,
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to update digest schedule",
			);
		},
	});

	const schedules = scheduleQuery.data ?? [];
	const isLoading = scheduleQuery.isLoading;
	const isError = scheduleQuery.isError;

	const handleToggle = (segment: string, enabled: boolean) => {
		setDrafts((prev) => ({
			...prev,
			[segment]: {
				...(prev[segment] ?? {
					enabled,
					cadenceHours: "168",
					lookaheadDays: "14",
				}),
				enabled,
			},
		}));
	};

	const handleInputChange = (
		segment: string,
		field: keyof Draft,
		value: string,
	) => {
		setDrafts((prev) => ({
			...prev,
			[segment]: {
				...(prev[segment] ?? {
					enabled: false,
					cadenceHours: "168",
					lookaheadDays: "14",
				}),
				[field]: value,
			},
		}));
	};

	const handleSubmit = (schedule: Schedule) => {
		const draft = drafts[schedule.segment];
		if (!draft) return;
		const cadence = Number.parseInt(draft.cadenceHours, 10);
		const lookahead = Number.parseInt(draft.lookaheadDays, 10);
		if (Number.isNaN(cadence) || Number.isNaN(lookahead)) {
			toast.error("Cadence and lookahead must be numbers");
			return;
		}
		mutation.mutate({
			segment: schedule.segment,
			enabled: draft.enabled,
			cadenceHours: cadence,
			lookaheadDays: lookahead,
		});
	};

	const renderSummary = (schedule: Schedule) => {
		const summary = schedule.metadata ?? {};
		const recipients = Number(summary.lastQueuedRecipients ?? 0);
		const segmentsWithEvents = Array.isArray(summary.segmentsWithEvents)
			? summary.segmentsWithEvents.length
			: 0;
		const lastSent = schedule.lastSentAt
			? formatTimestamp(schedule.lastSentAt)
			: null;
		const nextSendIso = computeNextSend(schedule);
		const nextSend = nextSendIso ? formatTimestamp(nextSendIso) : null;
		return (
			<div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
				<Badge variant="outline">Last sent: {lastSent ?? "Never"}</Badge>
				<Badge variant="outline">Next run: {nextSend ?? "Pending"}</Badge>
				<Badge variant="outline">
					Recipients queued: {Number.isFinite(recipients) ? recipients : 0}
				</Badge>
				<Badge variant="outline">
					Segments w/ events: {segmentsWithEvents}
				</Badge>
			</div>
		);
	};

	const renderCard = (schedule: Schedule) => {
		const draft = drafts[schedule.segment];
		const pending = mutation.isPending;
		const cadenceNumber = Number.parseInt(draft?.cadenceHours ?? "0", 10);
		const lookaheadNumber = Number.parseInt(draft?.lookaheadDays ?? "0", 10);
		const isDirty =
			draft?.enabled !== schedule.enabled ||
			cadenceNumber !== schedule.cadenceHours ||
			lookaheadNumber !== schedule.lookaheadDays;
		const disabled = pending || !draft;
		return (
			<Card key={schedule.id}>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-lg capitalize">
								{schedule.segment}
							</CardTitle>
							<CardDescription>
								{segmentDescriptions[schedule.segment] ??
									"Customize this digest segment."}
							</CardDescription>
						</div>
						<Switch
							checked={draft?.enabled ?? false}
							onCheckedChange={(value) => handleToggle(schedule.segment, value)}
							disabled={pending}
						/>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor={`${schedule.segment}-cadence`}>
								Cadence (hours)
							</Label>
							{isLoading ? (
								<Skeleton className="h-10 w-full" />
							) : (
								<Input
									id={`${schedule.segment}-cadence`}
									type="number"
									min={6}
									value={draft?.cadenceHours ?? ""}
									onChange={(event) =>
										handleInputChange(
											schedule.segment,
											"cadenceHours",
											event.target.value,
										)
									}
									disabled={pending}
								/>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor={`${schedule.segment}-lookahead`}>
								Lookahead window (days)
							</Label>
							{isLoading ? (
								<Skeleton className="h-10 w-full" />
							) : (
								<Input
									id={`${schedule.segment}-lookahead`}
									type="number"
									min={1}
									value={draft?.lookaheadDays ?? ""}
									onChange={(event) =>
										handleInputChange(
											schedule.segment,
											"lookaheadDays",
											event.target.value,
										)
									}
									disabled={pending}
								/>
							)}
						</div>
					</div>
					{renderSummary(schedule)}
				</CardContent>
				<CardFooter className="flex justify-end">
					<Button
						onClick={() => handleSubmit(schedule)}
						disabled={disabled || !isDirty}
					>
						{pending ? "Saving…" : "Save changes"}
					</Button>
				</CardFooter>
			</Card>
		);
	};

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{ label: "Email digests", current: true },
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />
			<section className="space-y-4">
				<div className="flex flex-col gap-2">
					<h1 className="font-semibold text-2xl tracking-tight">
						Email digest cadence
					</h1>
					<p className="text-muted-foreground text-sm">
						Control how often digest emails are generated and who receives each
						segment.
					</p>
				</div>
				{isError ? (
					<Card>
						<CardHeader>
							<CardTitle>Unable to load schedules</CardTitle>
							<CardDescription>
								{scheduleQuery.error instanceof Error
									? scheduleQuery.error.message
									: "Something went wrong while fetching digest configuration."}
							</CardDescription>
						</CardHeader>
					</Card>
				) : (
					<div className="grid gap-4 md:grid-cols-2">
						{isLoading && !schedules.length
							? placeholders.map((token) => (
									<Skeleton key={token} className="h-48 w-full" />
								))
							: schedules.map((schedule) => renderCard(schedule))}
					</div>
				)}
			</section>
		</AppShell>
	);
}
