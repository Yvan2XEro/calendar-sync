import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicEventsCalendarSection } from "@/components/events/PublicEventsCalendarSection";
import { HeaderNavWrapper } from "@/components/layout/HeaderNavWrapper";
import { Button } from "@/components/ui/button";
import { auth, enforceTukiSessionRoles } from "@/lib/auth";
import { fetchUpcomingPublicEvents } from "@/lib/events/public-upcoming-events";

const PUBLIC_EVENTS_FETCH_LIMIT = 500;

export default async function HomePage() {
	const headerList = await headers();
	const sessionResponse = await auth.api.getSession({
		headers: headerList,
	});
	const normalized = await enforceTukiSessionRoles(sessionResponse);

	if (normalized.session) {
		redirect("/dashboard");
	}

        let initialEvents: Awaited<ReturnType<typeof fetchUpcomingPublicEvents>> = [];
        try {
                initialEvents = await fetchUpcomingPublicEvents(
                        PUBLIC_EVENTS_FETCH_LIMIT,
                );
        } catch (error) {
                console.warn("Unable to load public events", error);
        }

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<HeaderNavWrapper>
				<div className="flex w-full items-center justify-between py-4">
					<Link
						href="/"
						className="font-semibold text-lg text-primary tracking-tight"
					>
						CalendarSync
					</Link>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link href="/auth/sign-in">Sign in</Link>
						</Button>
					</div>
				</div>
			</HeaderNavWrapper>

			<main className="flex-1">
				<section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 lg:px-10">
					<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div className="space-y-2">
							<p className="text-muted-foreground text-sm uppercase tracking-wide">
								Upcoming programming
							</p>
							<h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
								Explore the CalendarSync schedule
							</h1>
							<p className="text-muted-foreground text-sm sm:text-base">
								Browse the latest approved events from every CalendarSync
								organization. Sign in when you&apos;re ready to sync them with
								your personal calendar.
							</p>
						</div>
						<Button asChild size="lg">
							<Link href="/auth/sign-in?redirect=/events">
								Sign in to sync your calendar
							</Link>
						</Button>
					</div>
					<PublicEventsCalendarSection
						initialEvents={initialEvents}
						limit={PUBLIC_EVENTS_FETCH_LIMIT}
					/>
				</section>
			</main>
		</div>
	);
}
