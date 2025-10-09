"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { useQuery } from "@tanstack/react-query";

import EventsCalendar from "@/components/events/EventsCalendar";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
        Card,
        CardContent,
        CardDescription,
        CardHeader,
        CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { googleCalendarKeys } from "@/lib/query-keys/google-calendar";
import { googleCalendarApi } from "@/lib/trpc-client";
import type { UpcomingEvent } from "@/types/events";

const DEFAULT_CALENDAR_ID = "primary";

export default function AccountCalendarIntegrationsPage() {
        const googleCalendarQuery = useQuery({
                queryKey: googleCalendarKeys.upcoming(DEFAULT_CALENDAR_ID),
                queryFn: () =>
                        googleCalendarApi.listUpcomingEvents({
                                calendarId: DEFAULT_CALENDAR_ID,
                        }),
        });

        const googleEvents = (googleCalendarQuery.data ?? []) as UpcomingEvent[];

        const googleErrorMessage =
                googleCalendarQuery.error instanceof Error
                        ? googleCalendarQuery.error.message
                        : null;

        return (
                <AppShell
                        breadcrumbs={[
                                { label: "Account", href: "/account/settings" },
                                {
                                        label: "Calendar integrations",
                                        href: "/account/integrations/calendars",
                                        current: true,
                                },
                        ]}
                        headerRight={<UserAvatar />}
                >
                        <RedirectToSignIn />
                        <div className="space-y-6 p-6">
                                <div className="space-y-2">
                                        <h1 className="font-semibold text-2xl">
                                                Calendar integrations
                                        </h1>
                                        <p className="text-muted-foreground">
                                                Browse your Google Calendar events without leaving the workspace.
                                        </p>
                                </div>
                                <Tabs defaultValue="google" className="space-y-6">
                                        <TabsList>
                                                <TabsTrigger value="google">Google Calendar</TabsTrigger>
                                                <TabsTrigger value="outlook" disabled>
                                                        Outlook (coming soon)
                                                </TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="google" className="space-y-4">
                                                <Card>
                                                        <CardHeader>
                                                                <CardTitle>Google Calendar</CardTitle>
                                                                <CardDescription>
                                                                        Events are pulled straight from your linked Google account and
                                                                        displayed below.
                                                                </CardDescription>
                                                        </CardHeader>
                                                        <CardContent className="text-muted-foreground text-sm">
                                                                Switch back to your events page any time to compare upcoming
                                                                programming.
                                                        </CardContent>
                                                </Card>
                                                {googleErrorMessage ? (
                                                        <Alert variant="destructive">
                                                                <AlertTitle>
                                                                        We couldn’t load your Google events
                                                                </AlertTitle>
                                                                <AlertDescription>
                                                                        {googleErrorMessage}
                                                                </AlertDescription>
                                                        </Alert>
                                                ) : null}
                                                <EventsCalendar
                                                        events={googleEvents}
                                                        isLoading={googleCalendarQuery.isLoading}
                                                        isFetching={googleCalendarQuery.isFetching}
                                                        isError={googleCalendarQuery.isError}
                                                        onRetry={googleCalendarQuery.refetch}
                                                />
                                        </TabsContent>
                                </Tabs>
                        </div>
                </AppShell>
        );
}
