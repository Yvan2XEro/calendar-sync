"use client";

import * as React from "react";
import { AlertCircle, Filter, Loader2, RefreshCw } from "lucide-react";
import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { useQuery } from "@tanstack/react-query";

import { EventCard } from "@/components/events/EventCard";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { eventKeys } from "@/lib/query-keys/events";
import { eventsApi } from "@/lib/trpc-client";
import { formatDateBadge, getEventTimezone } from "@/lib/calendar-links";
import type { UpcomingEvent } from "@/types/events";

const EVENTS_LIMIT = 20;

function getEventDateKey(event: UpcomingEvent): string {
  return formatDateBadge(event);
}

export default function EventsPage() {
  const [search, setSearch] = React.useState("");
  const [location, setLocation] = React.useState("all");
  const [date, setDate] = React.useState("");

  const eventsQuery = useQuery({
    queryKey: eventKeys.recentForUser({ limit: EVENTS_LIMIT }),
    queryFn: () => eventsApi.listRecentForUser({ limit: EVENTS_LIMIT }),
  });

  const events = eventsQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();

  const locationOptions = React.useMemo(() => {
    const unique = new Map<string, string>();
    for (const event of events) {
      const label = event.location?.trim();
      if (!label || label.length === 0) continue;
      const key = label.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, label);
      }
    }
    return Array.from(unique.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [events]);

  const filteredEvents = React.useMemo(() => {
    if (events.length === 0) return [];

    return events.filter((event) => {
      const matchesLocation =
        location === "all" ||
        (event.location?.trim().toLowerCase() ?? "") === location.toLowerCase();

      const matchesDate =
        date.length === 0 || getEventDateKey(event) === date;

      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          event.title,
          event.description ?? "",
          event.organization.name,
          event.location ?? "",
          getEventTimezone(event) ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesLocation && matchesDate && matchesSearch;
    });
  }, [events, location, date, normalizedSearch]);

  const isFiltering =
    normalizedSearch.length > 0 || location !== "all" || date.length > 0;

  const handleResetFilters = React.useCallback(() => {
    setSearch("");
    setLocation("all");
    setDate("");
  }, []);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Events", current: true },
      ]}
      headerRight={<UserAvatar />}
    >
      <RedirectToSignIn />

      <section className="space-y-6">
        <Card className="space-y-3 rounded-3xl border-none bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 text-foreground shadow-sm">
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">Upcoming programming</p>
            <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
              Your events at a glance
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm">
              Explore approved events from the organizations you follow. Add them to your calendar in a click and stay aligned with your team.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
            <span>
              Showing {filteredEvents.length} of {events.length} upcoming events
            </span>
            {eventsQuery.isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading latest schedule
              </span>
            ) : null}
          </div>
        </Card>

        <FiltersPanel
          search={search}
          onSearchChange={setSearch}
          location={location}
          onLocationChange={setLocation}
          locationOptions={locationOptions}
          date={date}
          onDateChange={setDate}
          onReset={handleResetFilters}
          isFiltering={isFiltering}
        />

        {eventsQuery.isLoading ? (
          <EventsSkeleton />
        ) : eventsQuery.isError ? (
          <ErrorState onRetry={eventsQuery.refetch} />
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            isFiltering={isFiltering}
            onReset={handleResetFilters}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function FiltersPanel({
  search,
  onSearchChange,
  location,
  onLocationChange,
  locationOptions,
  date,
  onDateChange,
  onReset,
  isFiltering,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  locationOptions: { value: string; label: string }[];
  date: string;
  onDateChange: (value: string) => void;
  onReset: () => void;
  isFiltering: boolean;
}) {
  return (
    <Card className="space-y-4 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Filter className="size-4" aria-hidden />
        <span>Refine what you see</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="events-search">Search</Label>
          <Input
            id="events-search"
            value={search}
            placeholder="Search by title, organization, or keyword"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Location</Label>
          <Select value={location} onValueChange={onLocationChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="events-date">Start date</Label>
          <Input
            id="events-date"
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={!isFiltering}
        >
          <RefreshCw className="mr-2 size-4" aria-hidden /> Reset filters
        </Button>
        {isFiltering ? (
          <span className="text-muted-foreground text-xs">
            Adjust filters to broaden your view.
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function EventsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card
          key={index}
          className="flex h-full flex-col gap-4 rounded-2xl border border-border/40 bg-card/60 p-5"
        >
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="mt-auto flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/50 bg-destructive/10 p-8 text-center text-destructive">
      <AlertCircle className="size-8" aria-hidden />
      <div className="space-y-2">
        <h2 className="font-semibold text-lg">We couldn’t load your events</h2>
        <p className="text-sm">Check your connection and try again.</p>
      </div>
      <Button variant="destructive" onClick={onRetry} type="button">
        Try again
      </Button>
    </Card>
  );
}

function EmptyState({
  isFiltering,
  onReset,
}: {
  isFiltering: boolean;
  onReset: () => void;
}) {
  return (
    <Card className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 bg-card/60 p-8 text-center text-muted-foreground">
      <div className="space-y-2">
        <h2 className="font-semibold text-lg text-foreground">
          {isFiltering ? "No events match your filters" : "No upcoming events"}
        </h2>
        <p className="text-sm">
          {isFiltering
            ? "Broaden your filters or clear them to see more programming."
            : "Once organizations publish new events they’ll show up here."}
        </p>
      </div>
      {isFiltering ? (
        <Button type="button" variant="outline" onClick={onReset}>
          Clear filters
        </Button>
      ) : null}
    </Card>
  );
}
