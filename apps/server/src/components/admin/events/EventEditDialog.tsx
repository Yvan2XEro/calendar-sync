"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { EventHeroMediaType } from "@/lib/event-content";
import {
	formatReminderCadenceInput,
	parseEventMessagingSettings,
	parseReminderCadenceInput,
} from "@/lib/events/messaging";
import type { EventListItem } from "./types";

export type EventEditFormValues = {
        title: string;
        slug: string;
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
        flagId: string;
        heroMediaType: EventHeroMediaType | "none";
        heroMediaUrl: string;
        heroMediaAlt: string;
        heroMediaPosterUrl: string;
	landingHeadline: string;
	landingSubheadline: string;
	landingBody: string;
	landingSeoDescription: string;
	landingCtaLabel: string;
	landingCtaUrl: string;
	messagingConfirmationSubject: string;
	messagingReminderSubject: string;
	messagingUpdateSubject: string;
	messagingCancellationSubject: string;
	messagingFollowUpSubject: string;
	messagingReplyTo: string;
	messagingReminderCadence: string;
};

export type ProviderOption = {
        id: string;
        name: string;
};

export type FlagOption = {
        id: string;
        label: string;
        priority: number;
};

type EventEditDialogProps = {
        open: boolean;
        mode: "create" | "edit";
        event: EventListItem | null;
        providers: ProviderOption[];
        flags: FlagOption[];
        onSubmit: (values: EventEditFormValues) => void;
        onClose: () => void;
        isSaving: boolean;
};

const defaultValues: EventEditFormValues = {
        title: "",
        slug: "",
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
        flagId: "",
        heroMediaType: "none",
        heroMediaUrl: "",
        heroMediaAlt: "",
        heroMediaPosterUrl: "",
	landingHeadline: "",
	landingSubheadline: "",
	landingBody: "",
	landingSeoDescription: "",
	landingCtaLabel: "",
	landingCtaUrl: "",
	messagingConfirmationSubject: "",
	messagingReminderSubject: "",
	messagingUpdateSubject: "",
	messagingCancellationSubject: "",
	messagingFollowUpSubject: "",
	messagingReplyTo: "",
	messagingReminderCadence: "",
};

export function EventEditDialog({
        open,
        mode,
        event,
        providers,
        flags,
        onSubmit,
        onClose,
        isSaving,
}: EventEditDialogProps) {
	const [values, setValues] = useState<EventEditFormValues>({
		...defaultValues,
	});
	const [slugEdited, setSlugEdited] = useState(false);

	const canGenerateSlug = useMemo(
		() => values.title.trim().length > 0,
		[values.title],
	);

	function slugify(value: string) {
		return value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.replace(/-{2,}/g, "-");
	}

	useEffect(() => {
		if (!event || !open) {
			setValues({ ...defaultValues });
			setSlugEdited(false);
			return;
		}

		const messaging = parseEventMessagingSettings(
			event.metadata as Record<string, unknown> | null | undefined,
		);

                setValues({
                        title: event.title,
                        slug: event.slug,
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
                        flagId: event.flagId ?? event.flag?.id ?? "",
                        heroMediaType: event.heroMedia?.type ?? "none",
			heroMediaUrl: event.heroMedia?.url ?? "",
			heroMediaAlt: event.heroMedia?.alt ?? "",
			heroMediaPosterUrl: event.heroMedia?.posterUrl ?? "",
			landingHeadline: event.landingPage?.headline ?? "",
			landingSubheadline: event.landingPage?.subheadline ?? "",
			landingBody: event.landingPage?.body ?? "",
			landingSeoDescription: event.landingPage?.seoDescription ?? "",
			landingCtaLabel: event.landingPage?.cta?.label ?? "",
			landingCtaUrl: event.landingPage?.cta?.href ?? "",
			messagingConfirmationSubject: messaging.confirmationSubject ?? "",
			messagingReminderSubject: messaging.reminderSubject ?? "",
			messagingUpdateSubject: messaging.updateSubject ?? "",
			messagingCancellationSubject: messaging.cancellationSubject ?? "",
			messagingFollowUpSubject: messaging.followUpSubject ?? "",
			messagingReplyTo: messaging.replyToEmail ?? "",
			messagingReminderCadence: formatReminderCadenceInput(
				messaging.reminderCadenceHours,
			),
		});
		setSlugEdited(true);
	}, [event, open]);

	useEffect(() => {
		if (!open && mode === "create") {
			setValues({ ...defaultValues });
			setSlugEdited(false);
		}
	}, [mode, open]);

	const dialogTitle = mode === "edit" ? "Edit event" : "Create event";
	const dialogDescription =
		mode === "edit"
			? "Update key event metadata before saving your moderation changes."
			: "Craft a new event landing page, assign a provider, and publish without waiting for the worker.";

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
						if (mode === "edit" && !event) return;
						const nextSlug = slugify(values.slug);
						onSubmit({ ...values, slug: nextSlug });
					}}
					className="space-y-4"
				>
					<DialogHeader>
						<DialogTitle>{dialogTitle}</DialogTitle>
						<DialogDescription>{dialogDescription}</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="event-title">Title</Label>
						<Input
							id="event-title"
							value={values.title}
							onChange={(changeEvent) =>
								setValues((prev) => {
									const nextTitle = changeEvent.target.value;
									const nextState = {
										...prev,
										title: nextTitle,
									};
									if (
										(!slugEdited || prev.slug.length === 0) &&
										nextTitle.trim().length > 0
									) {
										const generated = slugify(nextTitle);
										if (generated.length > 0) {
											nextState.slug = generated;
										}
									}
									return nextState;
								})
							}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="event-slug">Slug</Label>
						<div className="flex flex-col gap-2 sm:flex-row">
							<Input
								id="event-slug"
								value={values.slug}
								onChange={(changeEvent) => {
									const raw = changeEvent.target.value;
									setSlugEdited(true);
									setValues((prev) => ({
										...prev,
										slug: raw,
									}));
								}}
								onBlur={() =>
									setValues((prev) => ({
										...prev,
										slug: slugify(prev.slug),
									}))
								}
								placeholder="event-slug"
								required
							/>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									if (!canGenerateSlug) return;
									const generated = slugify(values.title);
									setSlugEdited(true);
									setValues((prev) => ({
										...prev,
										slug: generated,
									}));
								}}
								disabled={!canGenerateSlug}
							>
								Generate slug
							</Button>
						</div>
						<p className="text-muted-foreground text-xs">
							Slugs appear in public URLs (e.g.{" "}
							<code>/events/{values.slug || "slug"}</code>).
						</p>
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
                                        <div className="space-y-2">
                                                <Label htmlFor="event-flag">Flag</Label>
                                                <Select
                                                        value={values.flagId}
                                                        onValueChange={(value) =>
                                                                setValues((prev) => ({
                                                                        ...prev,
                                                                        flagId: value,
                                                                }))
                                                        }
                                                >
                                                        <SelectTrigger id="event-flag">
                                                                <SelectValue placeholder="Select flag" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                                <SelectItem value="">Unassigned</SelectItem>
                                                                {flags.map((flag) => (
                                                                        <SelectItem key={flag.id} value={flag.id}>
                                                                                {flag.label} (P{flag.priority})
                                                                        </SelectItem>
                                                                ))}
                                                        </SelectContent>
                                                </Select>
                                        </div>
					<div className="rounded-md border bg-muted/30 p-3">
						<div className="space-y-1">
							<p className="font-semibold text-sm">Hero media</p>
							<p className="text-muted-foreground text-xs">
								Optional cover asset displayed at the top of the public landing
								page.
							</p>
						</div>
						<div className="mt-3 grid gap-3 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="event-hero-type">Media type</Label>
								<Select
									value={values.heroMediaType}
									onValueChange={(value) =>
										setValues((prev) => ({
											...prev,
											heroMediaType: value as EventHeroMediaType | "none",
											heroMediaUrl: value === "none" ? "" : prev.heroMediaUrl,
											heroMediaAlt: value === "none" ? "" : prev.heroMediaAlt,
											heroMediaPosterUrl:
												value === "video" ? prev.heroMediaPosterUrl : "",
										}))
									}
								>
									<SelectTrigger id="event-hero-type">
										<SelectValue placeholder="Select media type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">No hero</SelectItem>
										<SelectItem value="image">Image</SelectItem>
										<SelectItem value="video">Video</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="event-hero-url">Media URL</Label>
								<Input
									id="event-hero-url"
									value={values.heroMediaUrl}
									onChange={(changeEvent) =>
										setValues((prev) => ({
											...prev,
											heroMediaUrl: changeEvent.target.value,
										}))
									}
									placeholder="https://example.com/hero.jpg"
									disabled={values.heroMediaType === "none"}
								/>
							</div>
						</div>
						{values.heroMediaType !== "none" ? (
							<div className="mt-3 grid gap-3 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="event-hero-alt">Alt text</Label>
									<Input
										id="event-hero-alt"
										value={values.heroMediaAlt}
										onChange={(changeEvent) =>
											setValues((prev) => ({
												...prev,
												heroMediaAlt: changeEvent.target.value,
											}))
										}
										placeholder="Describe the hero media"
									/>
								</div>
								{values.heroMediaType === "video" ? (
									<div className="space-y-2">
										<Label htmlFor="event-hero-poster">Poster image URL</Label>
										<Input
											id="event-hero-poster"
											value={values.heroMediaPosterUrl}
											onChange={(changeEvent) =>
												setValues((prev) => ({
													...prev,
													heroMediaPosterUrl: changeEvent.target.value,
												}))
											}
											placeholder="https://example.com/poster.jpg"
										/>
									</div>
								) : null}
							</div>
						) : null}
					</div>
					<div className="rounded-md border bg-muted/30 p-3">
						<div className="space-y-1">
							<p className="font-semibold text-sm">Landing page content</p>
							<p className="text-muted-foreground text-xs">
								Provide copy for the public event page. Empty fields are
								ignored.
							</p>
						</div>
						<div className="mt-3 grid gap-3 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="event-landing-headline">Headline</Label>
								<Input
									id="event-landing-headline"
									value={values.landingHeadline}
									onChange={(changeEvent) =>
										setValues((prev) => ({
											...prev,
											landingHeadline: changeEvent.target.value,
										}))
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="event-landing-subheadline">Subheadline</Label>
								<Input
									id="event-landing-subheadline"
									value={values.landingSubheadline}
									onChange={(changeEvent) =>
										setValues((prev) => ({
											...prev,
											landingSubheadline: changeEvent.target.value,
										}))
									}
								/>
							</div>
						</div>
						<div className="mt-3 space-y-2">
							<Label htmlFor="event-landing-body">Body</Label>
							<textarea
								id="event-landing-body"
								value={values.landingBody}
								onChange={(changeEvent) =>
									setValues((prev) => ({
										...prev,
										landingBody: changeEvent.target.value,
									}))
								}
								className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							/>
						</div>
						<div className="mt-3 space-y-2">
							<Label htmlFor="event-landing-seo">SEO description</Label>
							<Input
								id="event-landing-seo"
								value={values.landingSeoDescription}
								onChange={(changeEvent) =>
									setValues((prev) => ({
										...prev,
										landingSeoDescription: changeEvent.target.value,
									}))
								}
								placeholder="Shown in link previews and meta tags"
							/>
						</div>
						<div className="mt-3 grid gap-3 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="event-landing-cta-label">CTA label</Label>
								<Input
									id="event-landing-cta-label"
									value={values.landingCtaLabel}
									onChange={(changeEvent) =>
										setValues((prev) => ({
											...prev,
											landingCtaLabel: changeEvent.target.value,
										}))
									}
									placeholder="Register now"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="event-landing-cta-url">CTA URL</Label>
								<Input
									id="event-landing-cta-url"
									value={values.landingCtaUrl}
									onChange={(changeEvent) =>
										setValues((prev) => ({
											...prev,
											landingCtaUrl: changeEvent.target.value,
										}))
									}
									placeholder="https://example.com/register"
								/>
							</div>
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
					<div className="space-y-4 border-t pt-4">
						<div className="space-y-1">
							<h3 className="font-medium text-sm">Email messaging</h3>
							<p className="text-muted-foreground text-sm">
								Customize attendee subjects, reminder cadence, and reply-to
								details.
							</p>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="messaging-confirmation">
									Confirmation subject
								</Label>
								<Input
									id="messaging-confirmation"
									value={values.messagingConfirmationSubject}
									onChange={(event) =>
										setValues((prev) => ({
											...prev,
											messagingConfirmationSubject: event.target.value,
										}))
									}
									placeholder={`Registration confirmed: ${values.title || "Event"}`}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="messaging-reminder">Reminder subject</Label>
								<Input
									id="messaging-reminder"
									value={values.messagingReminderSubject}
									onChange={(event) =>
										setValues((prev) => ({
											...prev,
											messagingReminderSubject: event.target.value,
										}))
									}
									placeholder={`Reminder: ${values.title || "Event"} is coming up`}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="messaging-update">Update subject</Label>
								<Input
									id="messaging-update"
									value={values.messagingUpdateSubject}
									onChange={(event) =>
										setValues((prev) => ({
											...prev,
											messagingUpdateSubject: event.target.value,
										}))
									}
									placeholder={`Update for ${values.title || "event"}`}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="messaging-cancellation">
									Cancellation subject
								</Label>
								<Input
									id="messaging-cancellation"
									value={values.messagingCancellationSubject}
									onChange={(event) =>
										setValues((prev) => ({
											...prev,
											messagingCancellationSubject: event.target.value,
										}))
									}
									placeholder={`Update: ${values.title || "Event"} has been cancelled`}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="messaging-follow-up">Follow-up subject</Label>
								<Input
									id="messaging-follow-up"
									value={values.messagingFollowUpSubject}
									onChange={(event) =>
										setValues((prev) => ({
											...prev,
											messagingFollowUpSubject: event.target.value,
										}))
									}
									placeholder={`Thanks for joining ${values.title || "our event"}`}
								/>
							</div>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="messaging-reminder-cadence">
									Reminder cadence (hours)
								</Label>
								<Input
									id="messaging-reminder-cadence"
									value={values.messagingReminderCadence}
									onChange={(event) =>
										setValues((prev) => ({
											...prev,
											messagingReminderCadence: event.target.value,
										}))
									}
									placeholder="24, 1"
								/>
								<p className="text-muted-foreground text-xs">
									Enter comma-separated hours before start time (e.g., 24, 1).
								</p>
							</div>
							<div className="space-y-2">
								<Label htmlFor="messaging-reply-to">Reply-to email</Label>
								<Input
									id="messaging-reply-to"
									type="email"
									value={values.messagingReplyTo}
									onChange={(event) =>
										setValues((prev) => ({
											...prev,
											messagingReplyTo: event.target.value,
										}))
									}
									placeholder="host@example.com"
								/>
								<p className="text-muted-foreground text-xs">
									Overrides the workspace reply-to address for attendee emails.
								</p>
							</div>
						</div>
					</div>
					<DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={isSaving}>
							{isSaving
								? "Saving…"
								: mode === "edit"
									? "Save changes"
									: "Create event"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
