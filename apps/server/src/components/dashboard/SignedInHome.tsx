"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { format } from "date-fns";

import AppShell from "@/components/layout/AppShell";
import { EventCard } from "@/components/events/EventCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { OrganizationsOverview } from "@/components/organizations/OrganizationsOverview";
import { eventKeys } from "@/lib/query-keys/events";
import { eventsApi } from "@/lib/trpc-client";
import { getUserRoles } from "@/lib/session";
import type { UpcomingEvent } from "@/types/events";

const RECENT_EVENTS_LIMIT = 8;

type SessionData = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    roles?: string[] | null;
  } & Record<string, unknown>;
} & Record<string, unknown>;

type JoinedOrganization = {
  id: string;
  name: string;
  role: string;
  slug: string;
  logo: string | null;
  metadata: Record<string, unknown> | null;
  joinedAt: string | Date | null;
};

type DiscoverOrganization = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: Record<string, unknown> | null;
  membersCount: number | null;
};

export function SignedInHome({ session }: { session: SessionData }) {
  const userName = session.user?.name ?? session.user?.email ?? "there";
  const roles = React.useMemo(() => getUserRoles(session), [session]);
  const isAdmin = roles.includes("admin");

  const recentEventsQuery = useQuery({
    queryKey: eventKeys.recentForUser({ limit: RECENT_EVENTS_LIMIT }),
    queryFn: () => eventsApi.listRecentForUser({ limit: RECENT_EVENTS_LIMIT }),
  });

  return (
    <AppShell
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Overview", current: true },
      ]}
      headerRight={<UserAvatar />}
    >
      <section className="space-y-6">
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">Welcome back</p>
            <h1 className="font-semibold text-3xl tracking-tight">
              Hi, {userName}!
            </h1>
            <p className="text-muted-foreground text-sm md:max-w-xl">
              Here’s what’s coming up across your CalendarSync organizations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <Button asChild variant="outline">
                <Link href="/admin/overview">Admin overview</Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/account/settings">Account settings</Link>
            </Button>
          </div>
        </div>
        <RecentEventsCarousel
          events={recentEventsQuery.data}
          isLoading={recentEventsQuery.isLoading}
          isError={recentEventsQuery.isError}
          onRetry={recentEventsQuery.refetch}
        />
      </section>

      <OrganizationsOverview />
    </AppShell>
  );
}

function RecentEventsCarousel({
  events,
  isLoading,
  isError,
  onRetry,
}: {
  events: UpcomingEvent[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const scroll = React.useCallback((direction: "next" | "prev") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.85;
    container.scrollBy({
      left: direction === "next" ? scrollAmount : -scrollAmount,
      behavior: "smooth",
    });
  }, []);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        scroll("next");
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scroll("prev");
      }
    },
    [scroll],
  );

  if (isLoading) {
    return (
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-xl tracking-tight">
              Recent events
            </h2>
            <p className="text-muted-foreground text-sm">
              Fresh updates from the organizations you follow.
            </p>
          </div>
          <span className="text-muted-foreground text-sm">Loading…</span>
        </header>
        <RecentEventsSkeleton />
      </section>
    );
  }

  if (isError) {
    return (
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-xl tracking-tight">
              Recent events
            </h2>
            <p className="text-muted-foreground text-sm">
              Fresh updates from the organizations you follow.
            </p>
          </div>
        </header>
        <ErrorState
          message="We couldn’t load recent events."
          onRetry={onRetry}
        />
      </section>
    );
  }

  const hasEvents = (events?.length ?? 0) > 0;

  if (!hasEvents) {
    return (
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-xl tracking-tight">
              Recent events
            </h2>
            <p className="text-muted-foreground text-sm">
              Fresh updates from the organizations you follow.
            </p>
          </div>
        </header>
        <EmptyState
          title="No upcoming events"
          description="As soon as your organizations publish events they’ll appear here."
        />
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            Recent events
          </h2>
          <p className="text-muted-foreground text-sm">
            Fresh updates from the organizations you follow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll("prev")}
            aria-label="Scroll events backward"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll("next")}
            aria-label="Scroll events forward"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>
      <div
        ref={scrollContainerRef}
        role="region"
        aria-label="Recent events"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex min-w-0 w-full md:max-w-[calc(100vw-20rem)] gap-4 overflow-x-auto pb-2"
      >
        {events?.map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </section>
  );
}

function JoinedOrganizationCard({
  organization,
}: {
  organization: JoinedOrganization;
}) {
  const tagline =
    getOrganizationTagline(organization.metadata) ??
    "Stay in sync with upcoming activity.";
  const initials = getOrganizationInitials(organization.name);
  const logoSrc =
    typeof organization.logo === "string" && organization.logo.trim().length > 0
      ? organization.logo
      : undefined;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-2">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 border">
            <AvatarImage src={logoSrc} alt={`${organization.name} logo`} />
            <AvatarFallback className="bg-muted text-foreground">
              {initials ? (
                <span className="font-medium uppercase">{initials}</span>
              ) : (
                <Building2 className="size-4" aria-hidden />
              )}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="truncate text-lg">
                {organization.name}
              </CardTitle>
              <Badge variant="outline" className="shrink-0 uppercase text-xs">
                {organization.role}
              </Badge>
            </div>
            <CardDescription className="line-clamp-2">
              {tagline}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4" aria-hidden />
          <span>Joined {formatDate(organization.joinedAt)}</span>
        </div>
        <Button asChild variant="ghost" size="sm" className="w-fit px-0">
          <Link href={`/organizations/${organization.slug}` as any}>
            Open workspace
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DiscoverOrganizationCard({
  organization,
  onJoin,
  isJoining,
}: {
  organization: DiscoverOrganization;
  onJoin: (organization: DiscoverOrganization) => void;
  isJoining: boolean;
}) {
  const tagline =
    getOrganizationTagline(organization.metadata) ??
    "Add this workspace to keep tabs on new events.";
  const membersLabel = new Intl.NumberFormat().format(
    organization.membersCount ?? 0,
  );
  const initials = getOrganizationInitials(organization.name);
  const logoSrc =
    typeof organization.logo === "string" && organization.logo.trim().length > 0
      ? organization.logo
      : undefined;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-2">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 border">
            <AvatarImage src={logoSrc} alt={`${organization.name} logo`} />
            <AvatarFallback className="bg-muted text-foreground">
              {initials ? (
                <span className="font-medium uppercase">{initials}</span>
              ) : (
                <Building2 className="size-4" aria-hidden />
              )}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="truncate text-lg">
              {organization.name}
            </CardTitle>
            <CardDescription className="line-clamp-2">{tagline}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Users className="size-4" aria-hidden />
          <span>{membersLabel} members</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => onJoin(organization)}
            disabled={isJoining}
            aria-busy={isJoining}
          >
            {isJoining ? (
              <React.Fragment>
                <Loader2 className="mr-2 size-4 animate-spin" /> Joining…
              </React.Fragment>
            ) : (
              "Join organization"
            )}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/organizations/${organization.slug}` as any}>
              View details
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "Unknown";
  const value = typeof date === "string" ? new Date(date) : date;
  try {
    return format(value, "MMM d, yyyy");
  } catch {
    return "Unknown";
  }
}

function getOrganizationTagline(
  metadata: Record<string, unknown> | null | undefined,
) {
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

function OrganizationSkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="flex h-full flex-col">
          <CardHeader className="space-y-2">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-9 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentEventsSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card
          key={index}
          className="flex min-w-[260px] flex-1 flex-col md:min-w-[300px]"
        >
          <Skeleton className="h-32 w-full" />
          <CardHeader className="space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="mt-2 text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive" className="flex flex-col gap-3 text-left">
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4" />
        <AlertTitle>Something went wrong</AlertTitle>
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

