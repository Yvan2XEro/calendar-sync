"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatDateTimeLocal } from "@/lib/datetime";
import { useEffect, useState } from "react";
import type { EventListItem } from "./types";

export type EventEditFormValues = {
  title: string;
  description: string;
  location: string;
  url: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  isPublished: boolean;
  externalId: string;
  priority: number;
  providerId: string;
};

export type ProviderOption = {
  id: string;
  name: string;
};

type EventEditDialogProps = {
  open: boolean;
  event: EventListItem | null;
  providers: ProviderOption[];
  onSubmit: (values: EventEditFormValues) => void;
  onClose: () => void;
  isSaving: boolean;
};

const defaultValues: EventEditFormValues = {
  title: "",
  description: "",
  location: "",
  url: "",
  startAt: "",
  endAt: "",
  isAllDay: false,
  isPublished: false,
  externalId: "",
  priority: 3,
  providerId: "",
};

export function EventEditDialog({
  open,
  event,
  providers,
  onSubmit,
  onClose,
  isSaving,
}: EventEditDialogProps) {
  const [values, setValues] = useState<EventEditFormValues>({
    ...defaultValues,
  });

  useEffect(() => {
    if (!event || !open) {
      setValues({ ...defaultValues });
      return;
    }

    setValues({
      title: event.title,
      description: event.description ?? "",
      location: event.location ?? "",
      url: event.url ?? "",
      startAt: formatDateTimeLocal(event.startAt),
      endAt: formatDateTimeLocal(event.endAt),
      isAllDay: event.isAllDay,
      isPublished: event.isPublished,
      externalId: event.externalId ?? "",
      priority: event.priority,
      providerId: event.provider?.id ?? "",
    });
  }, [event, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg md:min-w-[50vw]">
        <form
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (!event) return;
            onSubmit(values);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
            <DialogDescription>
              Update key event metadata before saving your moderation changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={values.title}
              onChange={(changeEvent) =>
                setValues((prev) => ({
                  ...prev,
                  title: changeEvent.target.value,
                }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-description">Description</Label>
            <textarea
              id="event-description"
              value={values.description}
              onChange={(changeEvent) =>
                setValues((prev) => ({
                  ...prev,
                  description: changeEvent.target.value,
                }))
              }
              className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-start">Start time</Label>
              <Input
                id="event-start"
                type="datetime-local"
                value={values.startAt}
                onChange={(changeEvent) =>
                  setValues((prev) => ({
                    ...prev,
                    startAt: changeEvent.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">End time</Label>
              <Input
                id="event-end"
                type="datetime-local"
                value={values.endAt}
                onChange={(changeEvent) =>
                  setValues((prev) => ({
                    ...prev,
                    endAt: changeEvent.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-location">Location</Label>
              <Input
                id="event-location"
                value={values.location}
                onChange={(changeEvent) =>
                  setValues((prev) => ({
                    ...prev,
                    location: changeEvent.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-url">URL</Label>
              <Input
                id="event-url"
                value={values.url}
                onChange={(changeEvent) =>
                  setValues((prev) => ({
                    ...prev,
                    url: changeEvent.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-priority">Priority</Label>
              <Select
                value={String(values.priority)}
                onValueChange={(value) =>
                  setValues((prev) => ({
                    ...prev,
                    priority: Number(value),
                  }))
                }
              >
                <SelectTrigger id="event-priority">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((priority) => (
                    <SelectItem key={priority} value={String(priority)}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-provider">Provider</Label>
              <Select
                value={values.providerId}
                onValueChange={(value) =>
                  setValues((prev) => ({
                    ...prev,
                    providerId: value,
                  }))
                }
              >
                <SelectTrigger id="event-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {/* <SelectItem value="all">Unassigned</SelectItem> */}
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-external">External ID</Label>
              <Input
                id="event-external"
                value={values.externalId}
                onChange={(changeEvent) =>
                  setValues((prev) => ({
                    ...prev,
                    externalId: changeEvent.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
              <div>
                <Label
                  htmlFor="event-published"
                  className="font-medium text-sm"
                >
                  Published
                </Label>
                <p className="text-muted-foreground text-xs">
                  Toggle whether the event is visible externally.
                </p>
              </div>
              <Switch
                id="event-published"
                checked={values.isPublished}
                onCheckedChange={(checked) =>
                  setValues((prev) => ({
                    ...prev,
                    isPublished: checked,
                  }))
                }
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
            <div>
              <Label htmlFor="event-allday" className="font-medium text-sm">
                All-day event
              </Label>
              <p className="text-muted-foreground text-xs">
                Set to true if this event spans the entire day.
              </p>
            </div>
            <Switch
              id="event-allday"
              checked={values.isAllDay}
              onCheckedChange={(checked) =>
                setValues((prev) => ({
                  ...prev,
                  isAllDay: checked,
                }))
              }
            />
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
