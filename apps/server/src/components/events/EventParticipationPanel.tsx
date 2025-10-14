"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

const formatCount = (value: number) => value.toLocaleString();

type ParticipationSummary = Awaited<
	ReturnType<typeof trpcClient.events.participation.summary.query>
>;

type JoinResult = Awaited<
	ReturnType<typeof trpcClient.events.participation.join.mutate>
>;

type LeaveResult = Awaited<
	ReturnType<typeof trpcClient.events.participation.leave.mutate>
>;

type EventParticipationPanelProps = {
	eventId: string;
	eventTitle: string;
};

export function EventParticipationPanel({
	eventId,
	eventTitle,
}: EventParticipationPanelProps) {
	const summaryQuery = useQuery<ParticipationSummary>({
		queryKey: eventKeys.participation.summary(eventId),
		queryFn: () => trpcClient.events.participation.summary.query({ eventId }),
	});

	const joinMutation = useMutation<JoinResult, Error>({
		mutationFn: () => trpcClient.events.participation.join.mutate({ eventId }),
		onSuccess: (result) => {
			void summaryQuery.refetch();
			const actionLabel =
				result.action === "already_joined"
					? "You're already registered"
					: "You're registered as a participant";
			toast.success(actionLabel, {
				description: `We'll keep you posted on updates for ${eventTitle}.`,
			});
		},
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : "Unable to join this event";
			toast.error(message, {
				description: "Try signing in again or contact the organizer.",
			});
		},
	});

	const leaveMutation = useMutation<LeaveResult, Error>({
		mutationFn: () => trpcClient.events.participation.leave.mutate({ eventId }),
		onSuccess: (result) => {
			void summaryQuery.refetch();
			const message =
				result.action === "left"
					? "You've left this event"
					: "You weren't registered for this event";
			toast.message(message);
		},
		onError: (error) => {
			const message =
				error instanceof Error
					? error.message
					: "Unable to update participation";
			toast.error(message);
		},
	});

	const handleJoin = () => {
		if (joinMutation.isPending || leaveMutation.isPending) return;
		joinMutation.mutate();
	};

	const handleLeave = () => {
		if (joinMutation.isPending || leaveMutation.isPending) return;
		leaveMutation.mutate();
	};

	const totalParticipants = summaryQuery.data?.totalParticipants ?? 0;
	const isParticipant = summaryQuery.data?.isParticipant ?? false;

	return (
		<section className="container mx-auto w-full px-6 pb-12 sm:px-12">
			<Card className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
				<CardHeader>
					<CardTitle>Participation</CardTitle>
					<CardDescription>
						See how many teammates are attending and reserve your own spot.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{summaryQuery.isError ? (
						<div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-destructive">
							<div className="flex items-center gap-2">
								<AlertCircle className="size-5" aria-hidden />
								<p className="font-medium text-sm">
									We couldn’t load participation details
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<p className="text-xs">
									Check your connection and try again to see who’s registered.
								</p>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									onClick={() => summaryQuery.refetch()}
								>
									Retry
								</Button>
							</div>
						</div>
					) : summaryQuery.isLoading ? (
						<div className="flex items-center gap-3">
							<Skeleton className="h-16 w-16 rounded-full" />
							<div className="space-y-2">
								<Skeleton className="h-4 w-40" />
								<Skeleton className="h-4 w-24" />
							</div>
						</div>
					) : (
						<>
							<div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
								<div>
									<p className="text-muted-foreground text-sm">
										Registered participants
									</p>
									<p className="font-semibold text-2xl">
										{formatCount(totalParticipants)}
									</p>
								</div>
								<Users className="size-10 text-primary" aria-hidden />
							</div>
							<div className="space-y-2 text-muted-foreground text-sm">
								<p>
									{isParticipant
										? "You're registered to attend this event."
										: "Reserve a participant spot to stay informed and receive reminders."}
								</p>
								<p>
									Your participation status helps organizers plan and align
									communications.
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-3">
								{isParticipant ? (
									<Button
										type="button"
										variant="outline"
										onClick={handleLeave}
										disabled={leaveMutation.isPending}
									>
										{leaveMutation.isPending ? (
											<Loader2
												className="mr-2 size-4 animate-spin"
												aria-hidden
											/>
										) : null}
										Leave event
									</Button>
								) : (
									<Button
										type="button"
										onClick={handleJoin}
										disabled={joinMutation.isPending}
									>
										{joinMutation.isPending ? (
											<Loader2
												className="mr-2 size-4 animate-spin"
												aria-hidden
											/>
										) : null}
										I'm attending
									</Button>
								)}
								<p className="text-muted-foreground text-xs sm:text-sm">
									You can update this anytime before the event starts.
								</p>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</section>
	);
}
