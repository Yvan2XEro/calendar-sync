"use client";

import type { EventStatus } from "@/app/(site)/admin/events/event-filters";
import { statusOptionMap } from "@/app/(site)/admin/events/event-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
        Sheet,
        SheetContent,
        SheetDescription,
        SheetHeader,
        SheetTitle,
} from "@/components/ui/sheet";
import { formatDisplayDate } from "@/lib/datetime";
import type { StatusAction } from "./status-actions";
import type { EventListItem } from "./types";

type EventDetailSheetProps = {
  event: EventListItem | null;
  statusActions: StatusAction[];
  onUpdateStatus: (eventId: string, status: EventStatus) => void;
  onEdit: (event: EventListItem) => void;
  onClose: () => void;
  statusLoading: boolean;
};

export function EventDetailSheet({
  event,
  statusActions,
  onUpdateStatus,
  onEdit,
  onClose,
  statusLoading,
}: EventDetailSheetProps) {
  return (
    <Sheet
      open={event != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="min-w-2xl max-w-2xl overflow-y-auto p-3"
      >
        <SheetHeader>
          <SheetTitle>{event?.title ?? "Event details"}</SheetTitle>
          <SheetDescription>
            Review the synchronized metadata before applying moderation changes.
          </SheetDescription>
        </SheetHeader>
        {event ? (
          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Event ID: {event.id}
              </p>
              {event.externalId ? (
                <p className="text-muted-foreground text-sm">
                  External ID: {event.externalId}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Badge variant={statusOptionMap[event.status].badgeVariant}>
                  {statusOptionMap[event.status].label}
                </Badge>
                <Badge variant={event.isPublished ? "default" : "outline"}>
                  {event.isPublished ? "Published" : "Draft"}
                </Badge>
                {event.isAllDay ? (
                  <Badge variant="outline">All-day</Badge>
                ) : null}
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">Schedule</p>
              <p className="text-muted-foreground">
                Starts: {formatDisplayDate(event.startAt)}
              </p>
              {event.endAt ? (
                <p className="text-muted-foreground">
                  Ends: {formatDisplayDate(event.endAt)}
                </p>
              ) : null}
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">Location</p>
              <p className="text-muted-foreground">
                {event.location ?? "No location provided"}
              </p>
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">Provider</p>
              <p className="text-muted-foreground">
                {event.provider?.name ?? "Unassigned"}
              </p>
              {event.provider?.category ? (
                <p className="text-muted-foreground">
                  {event.provider.category}
                </p>
              ) : null}
            </div>
            {event.description ? (
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">Description</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {event.description}
                </p>
              </div>
            ) : null}
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">Metadata</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-3 text-xs">
                {JSON.stringify(event.metadata ?? {}, null, 2)}
              </pre>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusActions.map((action) => (
                <Button
                  key={action.status}
                  onClick={() => onUpdateStatus(event.id, action.status)}
                  disabled={statusLoading}
                >
                  <action.icon className="mr-2 size-4" />
                  {action.label}
                </Button>
              ))}
              <Button variant="outline" onClick={() => onEdit(event)}>
                Edit event
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
