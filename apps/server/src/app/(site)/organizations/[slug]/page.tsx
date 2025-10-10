"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays } from "lucide-react";
import { useParams } from "next/navigation";
import * as React from "react";

import { EventCard } from "@/components/events/EventCard";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { orgsKeys } from "@/lib/query-keys/orgs";
import { orgsApi } from "@/lib/trpc-client";
import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/routers";

const fallbackBreadcrumb = "Organization";
const EVENTS_SKELETON_COUNT = 3;

type RouterOutputs = inferRouterOutputs<AppRouter>;
type OrganizationDetail = RouterOutputs["orgs"]["getForUser"];

type OrganizationHeaderProps = {
        organization: OrganizationDetail["organization"];
};

type OrganizationEventsProps = {
        organizationName: string;
        events: OrganizationDetail["events"];
};

function useSlug(): string | null {
        const params = useParams<{ slug?: string | string[] }>();
        const rawSlug = React.useMemo(() => {
                if (!params?.slug) return null;
                return Array.isArray(params.slug) ? params.slug[0] : params.slug;
        }, [params]);

        return rawSlug ?? null;
}

export default function OrganizationDetailPage() {
        const slug = useSlug();
        const decodedSlug = React.useMemo(() => {
                if (!slug) return null;
                try {
                        return decodeURIComponent(slug);
                } catch {
                        return slug;
                }
        }, [slug]);

        const query = useQuery({
                queryKey: slug ? orgsKeys.detail(slug) : orgsKeys.all,
                queryFn: () => orgsApi.getForUser({ slug: slug ?? "" }),
                enabled: Boolean(slug),
        });

        const organizationName = query.data?.organization.name ?? decodedSlug ?? fallbackBreadcrumb;

        return (
                <AppShell
                        breadcrumbs={[
                                { label: "Dashboard", href: "/dashboard" },
                                { label: "Organizations", href: "/organizations" },
                                { label: organizationName, current: true },
                        ]}
                        headerRight={<UserAvatar />}
                >
                        <RedirectToSignIn />
                        {!slug ? (
                                <MissingSlugAlert />
                        ) : query.isLoading ? (
                                <OrganizationDetailSkeleton />
                        ) : query.isError ? (
                                <OrganizationErrorState onRetry={query.refetch} error={query.error} />
                        ) : query.data ? (
                                <React.Fragment>
                                        <OrganizationHeader organization={query.data.organization} />
                                        <OrganizationEvents
                                                organizationName={query.data.organization.name}
                                                events={query.data.events}
                                        />
                                </React.Fragment>
                        ) : null}
                </AppShell>
        );
}

function OrganizationHeader({ organization }: OrganizationHeaderProps) {
        const tagline = getOrganizationTagline(organization.metadata);
        const initials = getOrganizationInitials(organization.name);
        const logoSrc =
                typeof organization.logo === "string" && organization.logo.trim().length > 0
                        ? organization.logo
                        : undefined;

        return (
                <Card className="space-y-6 rounded-3xl border-none bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 shadow-sm">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-start gap-4">
                                        <Avatar className="h-16 w-16 border">
                                                <AvatarImage src={logoSrc} alt={`${organization.name} logo`} />
                                                <AvatarFallback className="bg-muted text-foreground">
                                                        {initials ? (
                                                                <span className="font-semibold uppercase">{initials}</span>
                                                        ) : (
                                                                <Building2 className="size-6" aria-hidden />
                                                        )}
                                                </AvatarFallback>
                                        </Avatar>
                                        <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                        <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
                                                                {organization.name}
                                                        </h1>
                                                        <Badge variant="outline" className="text-xs uppercase">
                                                                {organization.role}
                                                        </Badge>
                                                </div>
                                                {tagline ? (
                                                        <p className="max-w-2xl text-muted-foreground text-sm">
                                                                {tagline}
                                                        </p>
                                                ) : null}
                                        </div>
                                </div>
                                <div className="text-muted-foreground text-sm">
                                        <span className="inline-flex items-center gap-2 rounded-full border border-dashed px-4 py-2">
                                                <CalendarDays className="size-4" aria-hidden />
                                                <span>Joined {formatDate(organization.joinedAt)}</span>
                                        </span>
                                </div>
                        </div>
                </Card>
        );
}

function OrganizationEvents({ organizationName, events }: OrganizationEventsProps) {
        return (
                <section className="mt-8 space-y-4">
                        <header>
                                <h2 className="font-semibold text-2xl tracking-tight">Upcoming events</h2>
                                <p className="text-muted-foreground text-sm">
                                        Events published by {organizationName} that you can add to your calendar.
                                </p>
                        </header>

                        {events.length === 0 ? (
                                <EmptyEventsState organizationName={organizationName} />
                        ) : (
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {events.map((event) => (
                                                <EventCard key={event.id} event={event} />
                                        ))}
                                </div>
                        )}
                </section>
        );
}

function EmptyEventsState({ organizationName }: { organizationName: string }) {
        return (
                <div className="rounded-2xl border border-dashed p-8 text-center">
                        <h3 className="font-semibold text-lg">No upcoming events</h3>
                        <p className="mt-2 text-muted-foreground text-sm">
                                {organizationName} hasn’t published any upcoming events yet. Check back soon!
                        </p>
                </div>
        );
}

function OrganizationDetailSkeleton() {
        return (
                <React.Fragment>
                        <Card className="space-y-6 rounded-3xl border-none bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 shadow-sm">
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                        <div className="flex items-start gap-4">
                                                <Skeleton className="h-16 w-16 rounded-full" />
                                                <div className="space-y-3">
                                                        <Skeleton className="h-8 w-48" />
                                                        <Skeleton className="h-4 w-64" />
                                                </div>
                                        </div>
                                        <Skeleton className="h-10 w-48 rounded-full" />
                                </div>
                        </Card>
                        <section className="mt-8 space-y-4">
                                <Skeleton className="h-7 w-40" />
                                <Skeleton className="h-4 w-72" />
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {Array.from({ length: EVENTS_SKELETON_COUNT }).map((_, index) => (
                                                <Card key={index} className="flex h-full flex-col gap-4 p-5">
                                                        <Skeleton className="h-24 w-full rounded-xl" />
                                                        <div className="space-y-3">
                                                                <Skeleton className="h-5 w-1/2" />
                                                                <Skeleton className="h-4 w-3/4" />
                                                                <Skeleton className="h-4 w-2/3" />
                                                        </div>
                                                        <div className="mt-auto space-y-2">
                                                                <Skeleton className="h-9 w-full" />
                                                                <Skeleton className="h-9 w-full" />
                                                        </div>
                                                </Card>
                                        ))}
                                </div>
                        </section>
                </React.Fragment>
        );
}

function OrganizationErrorState({
        error,
        onRetry,
}: {
        error: unknown;
        onRetry: () => void;
}) {
        const message = error instanceof Error ? error.message : "Something went wrong";
        return (
                <Alert variant="destructive" className="flex flex-col gap-3 text-left">
                        <div>
                                <AlertTitle>We couldn’t load this organization</AlertTitle>
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

function MissingSlugAlert() {
        return (
                <Alert variant="destructive">
                        <AlertTitle>Invalid organization</AlertTitle>
                        <AlertDescription>
                                We couldn’t determine which organization to display. Please return to the organizations list and
                                try again.
                        </AlertDescription>
                </Alert>
        );
}

function formatDate(date: string | Date | null | undefined) {
        if (!date) return "Unknown";
        const value = typeof date === "string" ? new Date(date) : date;
        try {
                        return new Intl.DateTimeFormat(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                        }).format(value);
        } catch {
                return "Unknown";
        }
}

function getOrganizationTagline(metadata: Record<string, unknown> | null | undefined) {
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
