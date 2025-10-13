import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNull,
	lte,
	not,
	or,
	type SQL,
	sql,
	sum,
} from "drizzle-orm";
// import { PostgresError } from "postgres";
import { z } from "zod";

import { db } from "@/db";
import {
	attendee,
	attendeeProfile,
	event,
	eventOrder,
	flag,
	organizationProvider,
	provider,
	ticketType,
} from "@/db/schema/app";
import { member, organization } from "@/db/schema/auth";
import {
	type EventHeroMedia,
	type EventLandingPageContent,
	parseHeroMedia,
	parseLandingPage,
} from "@/lib/event-content";
import {
	type EventAutomationType,
	enqueueEventAutomations,
} from "@/lib/events/automation";
import { syncEventWithGoogleCalendar } from "@/lib/events/calendar-sync";
import { parseEventMessagingSettings } from "@/lib/events/messaging";
import {
	createRegistrationDraft,
	enqueueWaitlist,
	getEventTicketInventory,
	markWaitlistEntryAsConverted,
	RegistrationError,
} from "@/lib/events/registration";
import { queueEmailDelivery } from "@/lib/mailer/deliveries";
import { queueOrderConfirmationEmail } from "@/lib/mailer/triggers";
import { isStripeConfigured, upsertPaymentIntent } from "@/lib/payments/stripe";
import {
	adminProcedure,
	protectedProcedure,
	publicProcedure,
	router,
} from "@/lib/trpc";

const DEFAULT_PAGE_SIZE = 25;

const ATTENDEE_DEFAULT_PAGE_SIZE = 50;
const attendeeSortOptions = [
	"created_desc",
	"created_asc",
	"check_in_desc",
] as const;
const checkInFilterOptions = ["checked_in", "not_checked_in"] as const;

const attendeeFilterSchema = z.object({
	status: z.array(z.enum(attendee.status.enumValues)).optional(),
	checkedIn: z.enum(checkInFilterOptions).optional(),
	noShow: z.boolean().optional(),
	q: z.string().trim().min(1).optional(),
});

const attendeeListInput = attendeeFilterSchema.extend({
	eventId: z.string().min(1),
	page: z.number().int().min(1).optional(),
	limit: z.number().int().min(1).max(200).optional(),
	sort: z.enum(attendeeSortOptions).optional(),
});

const attendeeExportInput = attendeeFilterSchema.extend({
	eventId: z.string().min(1),
});

const updateAttendeeStatusInput = z.object({
	attendeeId: z.string().min(1),
	status: z.enum(attendee.status.enumValues),
	noShow: z.boolean().optional(),
});

const bulkAnnouncementAudience = [
	"all",
	"registered",
	"checked_in",
	"not_checked_in",
	"waitlist",
	"no_show",
] as const;

const bulkAnnouncementInput = z.object({
	eventId: z.string().min(1),
	subject: z.string().trim().min(1),
	message: z.string().trim().min(1),
	audience: z.enum(bulkAnnouncementAudience).default("all"),
	previewText: z.string().trim().optional(),
});

const analyticsOverviewInput = z.object({
	eventId: z.string().min(1),
});

const analyticsTimeseriesInput = z.object({
	eventId: z.string().min(1),
	start: z
		.string()
		.datetime({ offset: true })
		.transform((value) => new Date(value))
		.optional(),
	end: z
		.string()
		.datetime({ offset: true })
		.transform((value) => new Date(value))
		.optional(),
	interval: z.enum(["day", "week"]).default("day"),
});

type AttendeeListInput = z.infer<typeof attendeeListInput>;
type AttendeeExportInput = z.infer<typeof attendeeExportInput>;
type AnalyticsTimeseriesInput = z.infer<typeof analyticsTimeseriesInput>;

type AttendeeSelection = {
	id: string;
	status: (typeof attendee.status.enumValues)[number];
	confirmationCode: string;
	checkInAt: Date | null;
	noShow: boolean;
	createdAt: Date;
	updatedAt: Date;
	profileId: string | null;
	profileName: string | null;
	profileEmail: string | null;
	profilePhone: string | null;
	ticketId: string | null;
	ticketName: string | null;
	orderId: string | null;
	orderStatus: (typeof eventOrder.status.enumValues)[number] | null;
	orderConfirmationCode: string | null;
	orderContactEmail: string | null;
	orderContactName: string | null;
};

type AttendeeListItem = {
	id: string;
	status: (typeof attendee.status.enumValues)[number];
	confirmationCode: string;
	checkInAt: Date | null;
	noShow: boolean;
	createdAt: Date;
	updatedAt: Date;
	name: string | null;
	email: string | null;
	phone: string | null;
	ticket: { id: string; name: string } | null;
	order: {
		id: string;
		status: (typeof eventOrder.status.enumValues)[number];
		confirmationCode: string | null;
		contactEmail: string | null;
	} | null;
};

const attendeeSelectionColumns = {
	id: attendee.id,
	status: attendee.status,
	confirmationCode: attendee.confirmationCode,
	checkInAt: attendee.checkInAt,
	noShow: attendee.noShow,
	createdAt: attendee.createdAt,
	updatedAt: attendee.updatedAt,
	profileId: attendee.profileId,
	profileName: attendeeProfile.displayName,
	profileEmail: attendeeProfile.email,
	profilePhone: attendeeProfile.phone,
	ticketId: attendee.ticketTypeId,
	ticketName: ticketType.name,
	orderId: attendee.orderId,
	orderStatus: eventOrder.status,
	orderConfirmationCode: eventOrder.confirmationCode,
	orderContactEmail: eventOrder.contactEmail,
	orderContactName: eventOrder.contactName,
} satisfies Record<string, unknown>;

type AnalyticsTimeseriesPoint = {
	bucket: string;
	registrations: number;
	checkIns: number;
	revenueCents: number;
	confirmedOrders: number;
};

function mapAttendeeSelection(row: AttendeeSelection): AttendeeListItem {
	const name = row.profileName ?? row.orderContactName ?? null;
	const email = row.profileEmail ?? row.orderContactEmail ?? null;
	const phone = row.profilePhone ?? null;
	const ticket =
		row.ticketId && row.ticketName
			? { id: row.ticketId, name: row.ticketName }
			: null;
	const order = row.orderId
		? {
				id: row.orderId,
				status: row.orderStatus ?? "pending_payment",
				confirmationCode: row.orderConfirmationCode,
				contactEmail: row.orderContactEmail,
			}
		: null;

	return {
		id: row.id,
		status: row.status,
		confirmationCode: row.confirmationCode,
		checkInAt: row.checkInAt,
		noShow: row.noShow,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		name,
		email,
		phone,
		ticket,
		order,
	} satisfies AttendeeListItem;
}

function buildAttendeeWhereClauses(
	input: AttendeeExportInput | AttendeeListInput,
): SQL<unknown>[] {
	const clauses: SQL<unknown>[] = [eq(attendee.eventId, input.eventId)];
	if (input.status && input.status.length > 0) {
		clauses.push(inArray(attendee.status, input.status));
	}
	if (input.checkedIn === "checked_in") {
		clauses.push(not(isNull(attendee.checkInAt)));
	} else if (input.checkedIn === "not_checked_in") {
		clauses.push(isNull(attendee.checkInAt));
	}
	if (input.noShow !== undefined) {
		clauses.push(eq(attendee.noShow, input.noShow));
	}
	if (input.q && input.q.length > 0) {
		const term = `%${input.q.replace(/\s+/g, " ")}%`;
		const searchClause = or(
			ilike(attendee.confirmationCode, term) as SQL<unknown>,
			ilike(attendeeProfile.email, term) as SQL<unknown>,
			ilike(attendeeProfile.displayName, term) as SQL<unknown>,
			ilike(eventOrder.contactEmail, term) as SQL<unknown>,
		) as SQL<unknown>;
		clauses.push(searchClause);
	}
	return clauses;
}

function sanitizeCsvValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	const text = String(value);
	if (text.includes('"') || text.includes(",") || text.includes("\n")) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

function buildAttendeeCsv(rows: AttendeeListItem[]): string {
	const header = [
		"Attendee ID",
		"Name",
		"Email",
		"Phone",
		"Status",
		"Confirmation Code",
		"Ticket",
		"Order ID",
		"Order Status",
		"Order Confirmation",
		"Checked In At",
		"No Show",
		"Created At",
	];
	const lines = [header.map(sanitizeCsvValue).join(",")];
	for (const row of rows) {
		lines.push(
			[
				row.id,
				row.name,
				row.email,
				row.phone,
				row.status,
				row.confirmationCode,
				row.ticket?.name ?? "",
				row.order?.id ?? "",
				row.order?.status ?? "",
				row.order?.confirmationCode ?? "",
				row.checkInAt ? row.checkInAt.toISOString() : "",
				row.noShow ? "true" : "false",
				row.createdAt.toISOString(),
			]
				.map(sanitizeCsvValue)
				.join(","),
		);
	}
	return `${lines.join("\n")}\n`;
}

function normalizeAnnouncementHtml(message: string): {
	html: string;
	text: string;
	preview: string | null;
} {
	const trimmed = message.trim();
	const escapeParagraph = (paragraph: string) =>
		paragraph
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	const paragraphs = trimmed
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0);
	const html = paragraphs.length
		? paragraphs
				.map((paragraph) => `<p>${escapeParagraph(paragraph)}</p>`)
				.join("\n")
		: `<p>${escapeParagraph(trimmed)}</p>`;
	const text = trimmed;
	const preview =
		paragraphs.at(0) ??
		trimmed.split("\n").find((line) => line.trim().length > 0) ??
		null;
	return {
		html,
		text,
		preview:
			preview && preview.length > 180 ? `${preview.slice(0, 177)}...` : preview,
	};
}

function ensureDateRange(
	input: Pick<AnalyticsTimeseriesInput, "start" | "end">,
	fallbackInterval: "day" | "week",
) {
	const now = new Date();
	const end = input.end && !Number.isNaN(input.end.getTime()) ? input.end : now;
	const startCandidate =
		input.start && !Number.isNaN(input.start.getTime()) ? input.start : null;
	const msPerUnit =
		fallbackInterval === "week" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
	const defaultWindow = fallbackInterval === "week" ? 12 : 30;
	const start =
		startCandidate ?? new Date(end.getTime() - (defaultWindow - 1) * msPerUnit);
	if (start > end) {
		return {
			start: new Date(end.getTime() - (defaultWindow - 1) * msPerUnit),
			end,
		};
	}
	return { start, end };
}

function generateSeriesBuckets(
	start: Date,
	end: Date,
	interval: "day" | "week",
): Date[] {
	const buckets: Date[] = [];
	const current = new Date(start);
	current.setUTCHours(0, 0, 0, 0);
	const limit = end.getTime();
	while (current.getTime() <= limit) {
		buckets.push(new Date(current));
		if (interval === "week") {
			current.setUTCDate(current.getUTCDate() + 7);
		} else {
			current.setUTCDate(current.getUTCDate() + 1);
		}
	}
	return buckets;
}

const filterSchema = z.object({
	providerId: z.string().min(1).optional(),
	status: z.enum(event.status.enumValues).optional(),
	flagId: z.union([z.string().min(1), z.literal(null)]).optional(),
	isPublished: z.boolean().optional(),
	isAllDay: z.boolean().optional(),
	q: z.string().trim().min(1).optional(),
	startFrom: z
		.string()
		.datetime({ offset: true })
		.transform((value) => new Date(value))
		.optional(),
	startTo: z
		.string()
		.datetime({ offset: true })
		.transform((value) => new Date(value))
		.optional(),
	priority: z
		.object({
			min: z.number().int().min(1).max(5).optional(),
			max: z.number().int().min(1).max(5).optional(),
		})
		.refine(
			(range) =>
				range.min === undefined ||
				range.max === undefined ||
				range.min <= range.max,
		)
		.optional(),
});

type EventFilterInput = z.infer<typeof filterSchema>;

type EventSelection = {
	id: string;
	slug: string;
	providerId: string;
	flagId: string | null;
	title: string;
	description: string | null;
	location: string | null;
	url: string | null;
	heroMedia: Record<string, unknown> | null;
	landingPage: Record<string, unknown> | null;
	startAt: Date;
	endAt: Date | null;
	isAllDay: boolean;
	isPublished: boolean;
	externalId: string | null;
	googleCalendarEventId: string | null;
	metadata: Record<string, unknown> | null;
	status: (typeof event.status.enumValues)[number];
	priority: number;
	createdAt: Date;
	updatedAt: Date;
	providerName: string | null;
	providerCategory: string | null;
	providerStatus: (typeof provider.status.enumValues)[number] | null;
	flagLabel: string | null;
	flagPriority: number | null;
};

type AutoApprovalInfo = {
	reason: string;
	providerId: string | null;
	at: string | null;
	trustedProvider: boolean;
};

function parseAutoApproval(
	metadata: Record<string, unknown> | null | undefined,
): AutoApprovalInfo | null {
	if (!metadata) return null;
	const raw = metadata.auto_approval;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

	const info = raw as Record<string, unknown>;
	const reason = typeof info.reason === "string" ? info.reason : null;
	if (!reason) return null;

	const providerId =
		typeof info.provider_id === "string" ? info.provider_id : null;
	const at = typeof info.at === "string" ? info.at : null;

	return {
		reason,
		providerId,
		at,
		trustedProvider: reason === "trusted_provider",
	} satisfies AutoApprovalInfo;
}

const slugSchema = z
	.string()
	.trim()
	.min(1, "Slug is required")
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
		message: "Use lowercase letters, numbers, and hyphens only",
	});

const heroMediaSchema = z
	.object({
		type: z.enum(["image", "video"]).optional(),
		url: z.string().trim().url({ message: "Enter a valid URL" }).optional(),
		alt: z.string().trim().optional(),
		posterUrl: z
			.string()
			.trim()
			.url({ message: "Enter a valid poster URL" })
			.optional(),
	})
	.superRefine((value, ctx) => {
		if (value.type && !value.url) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["url"],
				message: "Provide a URL for the selected media type",
			});
		}
		if (value.posterUrl && value.type !== "video") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["posterUrl"],
				message: "Poster images are only supported for videos",
			});
		}
	});

const landingPageSchema = z.object({
	headline: z.string().trim().optional(),
	subheadline: z.string().trim().optional(),
	body: z.string().trim().optional(),
	seoDescription: z.string().trim().optional(),
	cta: z
		.object({
			label: z.string().trim().optional(),
			href: z
				.string()
				.trim()
				.url({ message: "Enter a valid CTA URL" })
				.optional(),
		})
		.optional(),
});

type HeroMediaInput = z.infer<typeof heroMediaSchema>;
type LandingPageInput = z.infer<typeof landingPageSchema>;

function trimmedOrUndefined(value: string | null | undefined) {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeHeroMediaInput(value: HeroMediaInput | undefined) {
	if (!value) return {} as EventHeroMedia;
	const url = trimmedOrUndefined(value.url ?? undefined);
	const type = value.type && url ? value.type : undefined;
	const alt = trimmedOrUndefined(value.alt ?? undefined);
	const posterUrl =
		type === "video"
			? trimmedOrUndefined(value.posterUrl ?? undefined)
			: undefined;

	const next: EventHeroMedia = {};
	if (url) next.url = url;
	if (type) next.type = type;
	if (alt) next.alt = alt;
	if (posterUrl) next.posterUrl = posterUrl;

	return next;
}

function normalizeLandingPageInput(value: LandingPageInput | undefined) {
	if (!value) return {} as EventLandingPageContent;
	const headline = trimmedOrUndefined(value.headline ?? undefined);
	const subheadline = trimmedOrUndefined(value.subheadline ?? undefined);
	const body = trimmedOrUndefined(value.body ?? undefined);
	const seoDescription = trimmedOrUndefined(value.seoDescription ?? undefined);

	const ctaLabel = trimmedOrUndefined(value.cta?.label ?? undefined);
	const ctaHref = trimmedOrUndefined(value.cta?.href ?? undefined);

	const next: EventLandingPageContent = {};
	if (headline) next.headline = headline;
	if (subheadline) next.subheadline = subheadline;
	if (body) next.body = body;
	if (seoDescription) next.seoDescription = seoDescription;
	if (ctaLabel || ctaHref) {
		next.cta = {};
		if (ctaLabel) next.cta.label = ctaLabel;
		if (ctaHref) next.cta.href = ctaHref;
	}

	return next;
}

function isUniqueViolation(error: unknown) {
	// return error instanceof PostgresError && error.code === "23505";
	if (!error || typeof error !== "object") {
		return false;
	}
	const code = (error as { code?: string } | null)?.code;
	return code === "23505";
}

const listInputSchema = filterSchema.extend({
	page: z.number().int().min(1).optional(),
	limit: z.number().int().min(1).max(200).optional(),
});

type ListInput = z.infer<typeof listInputSchema>;

const getEventInput = z.object({
	id: z.string().min(1),
});

const updateStatusInput = z.object({
	id: z.string().min(1),
	status: z.enum(event.status.enumValues),
	publish: z.boolean().optional(),
});

const bulkUpdateStatusInput = z.object({
	ids: z.array(z.string().min(1)).min(1),
	status: z.enum(event.status.enumValues),
	publish: z.boolean().optional(),
});

const updateEventInput = z
	.object({
		id: z.string().min(1),
		title: z.string().trim().min(1).optional(),
		slug: slugSchema.optional(),
		description: z
			.string()
			.trim()
			.transform((value) => (value.length === 0 ? null : value))
			.nullable()
			.optional(),
		location: z
			.string()
			.trim()
			.transform((value) => (value.length === 0 ? null : value))
			.nullable()
			.optional(),
		url: z.string().trim().url().nullable().optional(),
		startAt: z
			.string()
			.datetime({ offset: true })
			.transform((value) => new Date(value))
			.optional(),
		endAt: z
			.union([
				z
					.string()
					.datetime({ offset: true })
					.transform((value) => new Date(value)),
				z.null(),
			])
			.optional(),
		isAllDay: z.boolean().optional(),
		isPublished: z.boolean().optional(),
		externalId: z
			.string()
			.trim()
			.transform((value) => (value.length === 0 ? null : value))
			.nullable()
			.optional(),
		flagId: z.union([z.string().min(1), z.null()]).optional(),
		providerId: z.string().min(1).optional(),
		priority: z.number().int().min(1).max(5).optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
		heroMedia: heroMediaSchema.optional(),
		landingPage: landingPageSchema.optional(),
	})
	.refine(
		(data) =>
			!(data.startAt && data.endAt instanceof Date) ||
			data.endAt.getTime() >= data.startAt.getTime(),
		{
			message: "End time must be after start time",
			path: ["endAt"],
		},
	);

const statsInputSchema = filterSchema;

const RECENT_EVENTS_DEFAULT_LIMIT = 8;
const RECENT_EVENTS_MAX_LIMIT = 500;
const RECENT_EVENTS_WINDOW_DAYS = 30;

const recentEventsInput = z
	.object({
		limit: z.number().int().min(1).max(RECENT_EVENTS_MAX_LIMIT).optional(),
	})
	.optional();

const syncCalendarInput = z
	.object({
		limit: z.number().int().min(1).max(RECENT_EVENTS_MAX_LIMIT).optional(),
	})
	.optional();

const createEventInput = z
	.object({
		title: z.string().trim().min(1),
		slug: slugSchema,
		description: z
			.string()
			.trim()
			.transform((value) => (value.length === 0 ? null : value))
			.nullable()
			.optional(),
		location: z
			.string()
			.trim()
			.transform((value) => (value.length === 0 ? null : value))
			.nullable()
			.optional(),
		url: z.string().trim().url().nullable().optional(),
		startAt: z
			.string()
			.datetime({ offset: true })
			.transform((value) => new Date(value)),
		endAt: z
			.union([
				z
					.string()
					.datetime({ offset: true })
					.transform((value) => new Date(value)),
				z.null(),
				z.undefined(),
			])
			.optional(),
		isAllDay: z.boolean().optional().default(false),
		isPublished: z.boolean().optional().default(false),
		externalId: z
			.string()
			.trim()
			.transform((value) => (value.length === 0 ? null : value))
			.nullable()
			.optional(),
		flagId: z.union([z.string().min(1), z.null()]).optional(),
		providerId: z.string().min(1),
		priority: z.number().int().min(1).max(5).default(3),
		metadata: z.record(z.string(), z.unknown()).optional(),
		heroMedia: heroMediaSchema.optional(),
		landingPage: landingPageSchema.optional(),
	})
	.refine(
		(data) =>
			!(data.startAt && data.endAt instanceof Date) ||
			data.endAt.getTime() >= data.startAt.getTime(),
		{
			message: "End time must be after start time",
			path: ["endAt"],
		},
	);

const deleteEventInput = z.object({ id: z.string().min(1) });

const metadataSchema = z.record(z.string(), z.unknown()).optional();

const personSchema = z.object({
	email: z.string().email().min(1),
	name: z.string().trim().min(1).max(120).optional(),
	phone: z.string().trim().min(5).max(40).optional(),
});

const attendeePersonSchema = personSchema.extend({
	waitlistEntryId: z.string().min(1).optional(),
	metadata: metadataSchema,
});

const purchaserSchema = personSchema.extend({ metadata: metadataSchema });

const registerInputSchema = z.object({
	eventId: z.string().min(1),
	ticketTypeId: z.string().min(1),
	purchaser: purchaserSchema,
	attendees: z.array(attendeePersonSchema).min(1),
	metadata: metadataSchema,
	orderItemMetadata: metadataSchema,
});

const waitlistInputSchema = z.object({
	eventId: z.string().min(1),
	ticketTypeId: z.string().min(1).optional(),
	person: personSchema,
	metadata: metadataSchema,
});

const ticketInventoryInput = z.object({
	eventId: z.string().min(1),
});

const eventSelection = {
	id: event.id,
	slug: event.slug,
	providerId: event.provider,
	flagId: event.flag,
	title: event.title,
	description: event.description,
	location: event.location,
	url: event.url,
	heroMedia: event.heroMedia,
	landingPage: event.landingPage,
	startAt: event.startAt,
	endAt: event.endAt,
	isAllDay: event.isAllDay,
	isPublished: event.isPublished,
	externalId: event.externalId,
	googleCalendarEventId: event.googleCalendarEventId,
	metadata: event.metadata,
	status: event.status,
	priority: event.priority,
	createdAt: event.createdAt,
	updatedAt: event.updatedAt,
	providerName: provider.name,
	providerCategory: provider.category,
	providerStatus: provider.status,
	flagLabel: flag.label,
	flagPriority: flag.priority,
};

function buildEventFilters(filters: EventFilterInput): SQL[] {
	const clauses: SQL[] = [];

	if (filters.providerId) {
		clauses.push(eq(event.provider, filters.providerId));
	}

	if (filters.status) {
		clauses.push(eq(event.status, filters.status));
	}

	if (filters.flagId !== undefined) {
		if (filters.flagId === null) {
			clauses.push(isNull(event.flag));
		} else {
			clauses.push(eq(event.flag, filters.flagId));
		}
	}

	if (filters.isPublished !== undefined) {
		clauses.push(eq(event.isPublished, filters.isPublished));
	}

	if (filters.isAllDay !== undefined) {
		clauses.push(eq(event.isAllDay, filters.isAllDay));
	}

	if (filters.startFrom) {
		clauses.push(gte(event.startAt, filters.startFrom));
	}

	if (filters.startTo) {
		clauses.push(lte(event.startAt, filters.startTo));
	}

	if (filters.priority) {
		if (filters.priority.min !== undefined) {
			clauses.push(gte(event.priority, filters.priority.min));
		}
		if (filters.priority.max !== undefined) {
			clauses.push(lte(event.priority, filters.priority.max));
		}
	}

	if (filters.q) {
		const term = `%${filters.q}%`;
		const searchClause = or(
			ilike(event.title, term),
			ilike(event.description, term),
			ilike(event.location, term),
		);
		if (searchClause) {
			clauses.push(searchClause);
		}
	}

	return clauses;
}

type EventStatusValue = (typeof event.status.enumValues)[number];

type AutomationChange = {
	previousStatus: EventStatusValue;
	previousPublished: boolean;
	nextStatus: EventStatusValue;
	nextPublished: boolean;
};

function derivePublishState(
	currentPublished: boolean,
	nextStatus: EventStatusValue,
	publishOverride: boolean | undefined,
): boolean {
	if (nextStatus !== "approved") {
		return false;
	}
	if (publishOverride !== undefined) {
		return publishOverride;
	}
	return currentPublished;
}

function resolveAutomationTriggers(
	change: AutomationChange,
): EventAutomationType[] {
	const triggers: EventAutomationType[] = [];
	const becamePublished = change.nextPublished && !change.previousPublished;
	const becameUnpublished = change.previousPublished && !change.nextPublished;

	if (becamePublished) {
		triggers.push("calendar_sync", "digest_refresh");
	} else if (becameUnpublished) {
		triggers.push("calendar_sync");
	} else if (
		change.previousStatus !== change.nextStatus &&
		change.nextStatus === "approved" &&
		change.nextPublished
	) {
		triggers.push("calendar_sync");
	}

	return Array.from(new Set(triggers));
}

function mapEvent(row: EventSelection) {
	const metadata = (row.metadata ?? {}) as Record<string, unknown>;
	const autoApproval = parseAutoApproval(metadata);

	return {
		id: row.id,
		slug: row.slug,
		providerId: row.providerId,
		flagId: row.flagId,
		title: row.title,
		description: row.description,
		location: row.location,
		url: row.url,
		heroMedia: parseHeroMedia(row.heroMedia),
		landingPage: parseLandingPage(row.landingPage),
		startAt: row.startAt,
		endAt: row.endAt,
		isAllDay: row.isAllDay,
		isPublished: row.isPublished,
		externalId: row.externalId,
		googleCalendarEventId: row.googleCalendarEventId,
		metadata,
		autoApproval,
		status: row.status,
		priority: row.priority,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		provider: row.providerName
			? {
					id: row.providerId,
					name: row.providerName,
					category: row.providerCategory,
					status: row.providerStatus,
				}
			: null,
		flag: row.flagId
			? {
					id: row.flagId,
					label: row.flagLabel,
					priority: row.flagPriority,
				}
			: null,
	} as const;
}

async function fetchEventOrThrow(id: string) {
	const rows = await db
		.select(eventSelection)
		.from(event)
		.leftJoin(provider, eq(provider.id, event.provider))
		.leftJoin(flag, eq(flag.id, event.flag))
		.where(eq(event.id, id))
		.limit(1);

	const row = rows.at(0);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
	}

	return mapEvent(row as EventSelection);
}

function throwRegistrationError(error: RegistrationError): never {
	switch (error.code) {
		case "event_not_found":
		case "ticket_not_found":
			throw new TRPCError({ code: "NOT_FOUND", message: error.message });
		case "profile_conflict":
			throw new TRPCError({ code: "CONFLICT", message: error.message });
		case "invalid_quantity":
		case "ticket_not_on_sale":
		case "ticket_inactive":
		case "ticket_sold_out":
		case "capacity_exceeded":
		case "max_per_order_exceeded":
			throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
	}
}

export const eventsRouter = router({
	listRecentForUser: protectedProcedure
		.input(recentEventsInput)
		.query(async ({ ctx, input }) => {
			const sessionUser = ctx.session.user;
			const userId =
				typeof (sessionUser as { id?: unknown })?.id === "string"
					? (sessionUser as { id: string }).id
					: null;
			if (!userId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Session user missing",
				});
			}
			const limit = input?.limit ?? RECENT_EVENTS_DEFAULT_LIMIT;

			const now = new Date();
			const windowEnd = new Date(
				now.getTime() + RECENT_EVENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
			);

			const rows = await db
				.select({
					id: event.id,
					slug: event.slug,
					title: event.title,
					description: event.description,
					location: event.location,
					url: event.url,
					heroMedia: event.heroMedia,
					landingPage: event.landingPage,
					startAt: event.startAt,
					endAt: event.endAt,
					metadata: event.metadata,
					organizationId: organization.id,
					organizationName: organization.name,
					organizationSlug: organization.slug,
					providerName: provider.name,
				})
				.from(event)
				.innerJoin(provider, eq(provider.id, event.provider))
				.innerJoin(
					organizationProvider,
					eq(organizationProvider.providerId, provider.id),
				)
				.innerJoin(
					organization,
					eq(organization.id, organizationProvider.organizationId),
				)
				.innerJoin(
					member,
					and(
						eq(member.organizationId, organization.id),
						eq(member.userId, userId),
					),
				)
				.where(
					and(
						eq(event.status, "approved"),
						eq(event.isPublished, true),
						gte(event.startAt, now),
						lte(event.startAt, windowEnd),
					),
				)
				.orderBy(event.startAt, event.id)
				.limit(limit);

			return rows.map((row) => ({
				id: row.id,
				slug: row.slug,
				title: row.title,
				description: row.description,
				location: row.location,
				url: row.url,
				heroMedia: parseHeroMedia(row.heroMedia),
				landingPage: parseLandingPage(row.landingPage),
				startAt: row.startAt,
				endAt: row.endAt,
				organization: {
					id: row.organizationId,
					name: row.organizationName,
					slug: row.organizationSlug,
				},
				providerName: row.providerName,
				imageUrl:
					typeof row.metadata?.imageUrl === "string"
						? (row.metadata.imageUrl as string)
						: null,
			}));
		}),
	syncCalendarForUser: protectedProcedure
		.input(syncCalendarInput)
		.mutation(async ({ ctx, input }) => {
			const sessionUser = ctx.session.user;
			const userId =
				typeof (sessionUser as { id?: unknown })?.id === "string"
					? (sessionUser as { id: string }).id
					: null;
			if (!userId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Session user missing",
				});
			}

			const limit = input?.limit ?? RECENT_EVENTS_MAX_LIMIT;
			const now = new Date();

			const rows = await db
				.select({
					eventId: event.id,
					memberId: member.id,
				})
				.from(event)
				.innerJoin(provider, eq(provider.id, event.provider))
				.innerJoin(
					organizationProvider,
					eq(organizationProvider.providerId, provider.id),
				)
				.innerJoin(
					organization,
					eq(organization.id, organizationProvider.organizationId),
				)
				.innerJoin(
					member,
					and(
						eq(member.organizationId, organization.id),
						eq(member.userId, userId),
					),
				)
				.where(
					and(
						eq(event.status, "approved"),
						eq(event.isPublished, true),
						eq(event.organizationId, organization.id),
						gte(event.startAt, now),
					),
				)
				.orderBy(event.startAt, event.id)
				.limit(limit);

			const eventsById = new Map<string, { memberId: string }>();

			for (const row of rows) {
				if (!eventsById.has(row.eventId)) {
					eventsById.set(row.eventId, { memberId: row.memberId });
				}
			}

			const summary = {
				total: eventsById.size,
				processed: 0,
				created: 0,
				updated: 0,
				deleted: 0,
				skipped: 0,
				failed: 0,
				errors: [] as Array<{ eventId: string; message: string }>,
			};

			for (const [eventId, { memberId }] of eventsById.entries()) {
				summary.processed += 1;
				try {
					const action = await syncEventWithGoogleCalendar(eventId, {
						memberId,
					});
					switch (action) {
						case "created":
							summary.created += 1;
							break;
						case "updated":
							summary.updated += 1;
							break;
						case "deleted":
							summary.deleted += 1;
							break;
						case "skipped":
							summary.skipped += 1;
							break;
					}
				} catch (error) {
					summary.failed += 1;
					const message =
						error instanceof Error
							? error.message
							: "Unknown calendar sync error";
					summary.errors.push({ eventId, message });
				}
			}

			return summary;
		}),
	list: adminProcedure
		.input(listInputSchema.optional())
		.query(async ({ input }) => {
			const filters: ListInput = { ...(input ?? {}) };
			const {
				page: requestedPage,
				limit: requestedLimit,
				...restFilters
			} = filters;
			const page = requestedPage ?? 1;
			const limit = requestedLimit ?? DEFAULT_PAGE_SIZE;

			const whereClauses = buildEventFilters(restFilters as EventFilterInput);
			const whereCondition =
				whereClauses.length > 0 ? and(...whereClauses) : undefined;

			const [totalResult, rows] = await Promise.all([
				db.select({ value: count() }).from(event).where(whereCondition),
				db
					.select(eventSelection)
					.from(event)
					.leftJoin(provider, eq(provider.id, event.provider))
					.leftJoin(flag, eq(flag.id, event.flag))
					.where(whereCondition)
					.orderBy(desc(event.startAt), desc(event.createdAt), desc(event.id))
					.offset((page - 1) * limit)
					.limit(limit),
			]);

			const total = Number(totalResult.at(0)?.value ?? 0);
			const items = rows.map((row) => mapEvent(row as EventSelection));

			return {
				items,
				total,
				page,
				limit,
			} as const;
		}),
	get: adminProcedure.input(getEventInput).query(async ({ input }) => {
		return fetchEventOrThrow(input.id);
	}),
	updateStatus: adminProcedure
		.input(updateStatusInput)
		.mutation(async ({ input }) => {
			const result = await db.transaction(async (tx) => {
				const existingRows = await tx
					.select({
						id: event.id,
						status: event.status,
						isPublished: event.isPublished,
					})
					.from(event)
					.where(eq(event.id, input.id))
					.limit(1);

				const current = existingRows.at(0);

				if (!current) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Event not found",
					});
				}

				const nextPublished = derivePublishState(
					current.isPublished,
					input.status,
					input.publish,
				);

				const [updated] = await tx
					.update(event)
					.set({
						status: input.status,
						isPublished: nextPublished,
						updatedAt: sql`now()`,
					})
					.where(eq(event.id, input.id))
					.returning({
						id: event.id,
						status: event.status,
						isPublished: event.isPublished,
					});

				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Event not found",
					});
				}

				const automationTriggers = resolveAutomationTriggers({
					previousStatus: current.status,
					previousPublished: current.isPublished,
					nextStatus: updated.status,
					nextPublished: updated.isPublished,
				});

				if (automationTriggers.length > 0) {
					await enqueueEventAutomations(
						tx,
						automationTriggers.map((type) => ({
							eventId: updated.id,
							type,
							payload: {
								reason: "status_change",
								previousStatus: current.status,
								nextStatus: updated.status,
								previousPublished: current.isPublished,
								nextPublished: updated.isPublished,
							},
						})),
					);
				}

				return { id: updated.id } as const;
			});

			return fetchEventOrThrow(result.id);
		}),
	bulkUpdateStatus: adminProcedure
		.input(bulkUpdateStatusInput)
		.mutation(async ({ input }) => {
			const ids = Array.from(new Set(input.ids));

			if (ids.length === 0) {
				return { updatedCount: 0 } as const;
			}

			const result = await db.transaction(async (tx) => {
				const existing = await tx
					.select({
						id: event.id,
						status: event.status,
						isPublished: event.isPublished,
					})
					.from(event)
					.where(inArray(event.id, ids));

				if (existing.length === 0) {
					return { updatedCount: 0 } as const;
				}

				let updatedCount = 0;
				const automationJobs: Array<{
					eventId: string;
					type: EventAutomationType;
					payload: Record<string, unknown>;
				}> = [];

				for (const current of existing) {
					const nextPublished = derivePublishState(
						current.isPublished,
						input.status,
						input.publish,
					);

					if (
						current.status === input.status &&
						current.isPublished === nextPublished
					) {
						continue;
					}

					const [updated] = await tx
						.update(event)
						.set({
							status: input.status,
							isPublished: nextPublished,
							updatedAt: sql`now()`,
						})
						.where(eq(event.id, current.id))
						.returning({
							id: event.id,
							status: event.status,
							isPublished: event.isPublished,
						});

					if (!updated) {
						continue;
					}

					updatedCount += 1;

					const triggers = resolveAutomationTriggers({
						previousStatus: current.status,
						previousPublished: current.isPublished,
						nextStatus: updated.status,
						nextPublished: updated.isPublished,
					});

					if (triggers.length > 0) {
						const payload = {
							reason: "bulk_status_change",
							previousStatus: current.status,
							nextStatus: updated.status,
							previousPublished: current.isPublished,
							nextPublished: updated.isPublished,
						} as const;

						for (const type of triggers) {
							automationJobs.push({
								eventId: updated.id,
								type,
								payload: { ...payload },
							});
						}
					}
				}

				if (automationJobs.length > 0) {
					await enqueueEventAutomations(tx, automationJobs);
				}

				return { updatedCount } as const;
			});

			return { updatedCount: result.updatedCount } as const;
		}),
	create: adminProcedure.input(createEventInput).mutation(async ({ input }) => {
		const heroMedia = normalizeHeroMediaInput(input.heroMedia);
		const landingPage = normalizeLandingPageInput(input.landingPage);
		const metadata = input.metadata ?? {};

		try {
			const [created] = await db
				.insert(event)
				.values({
					id: randomUUID(),
					slug: input.slug,
					provider: input.providerId,
					flag: input.flagId ?? null,
					title: input.title,
					description: input.description ?? null,
					location: input.location ?? null,
					url: input.url ?? null,
					heroMedia: heroMedia as Record<string, unknown>,
					landingPage: landingPage as Record<string, unknown>,
					startAt: input.startAt,
					endAt:
						input.endAt instanceof Date ? input.endAt : (input.endAt ?? null),
					isAllDay: input.isAllDay ?? false,
					isPublished: input.isPublished ?? false,
					externalId: input.externalId ?? null,
					status: "pending",
					priority: input.priority,
					metadata,
				})
				.returning({ id: event.id });

			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to create event",
				});
			}

			return fetchEventOrThrow(created.id);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "An event with this slug already exists.",
					cause: error,
				});
			}
			throw error;
		}
	}),
	update: adminProcedure.input(updateEventInput).mutation(async ({ input }) => {
		const updates: Record<string, unknown> = { updatedAt: sql`now()` };

		if (input.title !== undefined) updates.title = input.title;
		if (input.slug !== undefined) updates.slug = input.slug;
		if (input.description !== undefined)
			updates.description = input.description;
		if (input.location !== undefined) updates.location = input.location;
		if (input.url !== undefined) updates.url = input.url;
		if (input.startAt !== undefined) updates.startAt = input.startAt;
		if (input.endAt !== undefined) updates.endAt = input.endAt;
		if (input.isAllDay !== undefined) updates.isAllDay = input.isAllDay;
		if (input.isPublished !== undefined)
			updates.isPublished = input.isPublished;
		if (input.externalId !== undefined) updates.externalId = input.externalId;
		if (input.flagId !== undefined) updates.flag = input.flagId;
		if (input.providerId !== undefined) updates.provider = input.providerId;
		if (input.priority !== undefined) updates.priority = input.priority;
		if (input.metadata !== undefined) updates.metadata = input.metadata;
		if (input.heroMedia !== undefined)
			updates.heroMedia = normalizeHeroMediaInput(input.heroMedia) as Record<
				string,
				unknown
			>;
		if (input.landingPage !== undefined)
			updates.landingPage = normalizeLandingPageInput(
				input.landingPage,
			) as Record<string, unknown>;

		if (Object.keys(updates).length === 1) {
			return fetchEventOrThrow(input.id);
		}

		try {
			const [updated] = await db
				.update(event)
				.set(updates)
				.where(eq(event.id, input.id))
				.returning({ id: event.id });

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Event not found",
				});
			}

			return fetchEventOrThrow(updated.id);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "An event with this slug already exists.",
					cause: error,
				});
			}
			throw error;
		}
	}),
	delete: adminProcedure.input(deleteEventInput).mutation(async ({ input }) => {
		const [deleted] = await db
			.delete(event)
			.where(eq(event.id, input.id))
			.returning({ id: event.id });

		if (!deleted) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
		}

		return { id: deleted.id } as const;
	}),
	ticketInventory: publicProcedure
		.input(ticketInventoryInput)
		.query(async ({ input }) => {
			const exists = await db
				.select({ id: event.id })
				.from(event)
				.where(eq(event.id, input.eventId))
				.limit(1);
			if (!exists.length) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			const inventory = await getEventTicketInventory(input.eventId);
			return inventory.map(
				({ ticket, remaining, used, saleOpen, soldOut }) => ({
					id: ticket.id,
					eventId: ticket.eventId,
					name: ticket.name,
					description: ticket.description,
					priceCents: ticket.priceCents,
					currency: ticket.currency,
					capacity: ticket.capacity,
					maxPerOrder: ticket.maxPerOrder,
					remaining,
					used,
					saleOpen,
					soldOut,
					status: ticket.status,
					isWaitlistEnabled: ticket.isWaitlistEnabled,
					salesStartAt: ticket.salesStartAt,
					salesEndAt: ticket.salesEndAt,
				}),
			);
		}),
	register: publicProcedure
		.input(registerInputSchema)
		.mutation(async ({ input }) => {
			try {
				const draft = await createRegistrationDraft({
					eventId: input.eventId,
					ticketTypeId: input.ticketTypeId,
					purchaser: input.purchaser,
					attendees: input.attendees,
					metadata: input.metadata ?? {},
					orderItemMetadata: input.orderItemMetadata ?? {},
				});

				let latestOrder = draft.order;
				let paymentIntentClientSecret: string | null = null;

				if (draft.order.totalCents > 0) {
					if (!isStripeConfigured()) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Payments are not enabled for this environment",
						});
					}

					const paymentIntent = await upsertPaymentIntent({
						amount: draft.order.totalCents,
						currency: draft.order.currency,
						description: `Registration for ${draft.event.title}`,
						receiptEmail: input.purchaser.email,
						metadata: {
							orderId: draft.order.id,
							eventId: draft.event.id,
							ticketTypeId: draft.ticket.id,
						},
					});
					paymentIntentClientSecret = paymentIntent.client_secret ?? null;

					let nextStatus = draft.order.status;
					switch (paymentIntent.status) {
						case "succeeded":
							nextStatus = "confirmed";
							break;
						case "requires_action":
						case "requires_payment_method":
							nextStatus = "requires_action";
							break;
						default:
							nextStatus = "pending_payment";
					}

					const [updatedOrder] = await db
						.update(eventOrder)
						.set({
							paymentIntentId: paymentIntent.id,
							externalPaymentState: paymentIntent.status,
							status: nextStatus,
						})
						.where(eq(eventOrder.id, draft.order.id))
						.returning();

					if (updatedOrder) {
						latestOrder = updatedOrder;
					}

					if (
						draft.order.status !== "confirmed" &&
						latestOrder.status === "confirmed"
					) {
						await db
							.update(attendee)
							.set({ status: "registered" })
							.where(eq(attendee.orderId, latestOrder.id));
					}
				}

				const attendees = draft.attendees.map((record) => ({
					id: record.id,
					confirmationCode: record.confirmationCode,
					status:
						latestOrder.status === "confirmed" ? "registered" : record.status,
				}));

				const waitlistIds = Array.from(
					new Set(
						input.attendees
							.map((attendeeInput) => attendeeInput.waitlistEntryId)
							.filter((value): value is string => Boolean(value)),
					),
				);
				if (waitlistIds.length > 0) {
					await Promise.all(
						waitlistIds.map((waitlistId) =>
							markWaitlistEntryAsConverted(waitlistId, latestOrder.id),
						),
					);
				}

				if (latestOrder.status === "confirmed") {
					await queueOrderConfirmationEmail(latestOrder.id);
				}

				return {
					orderId: latestOrder.id,
					confirmationCode: latestOrder.confirmationCode,
					orderStatus: latestOrder.status,
					paymentIntentClientSecret,
					remainingCapacity: draft.remainingCapacity,
					attendees,
				} as const;
			} catch (error) {
				if (error instanceof RegistrationError) {
					throwRegistrationError(error);
				}
				throw error;
			}
		}),
	waitlist: publicProcedure
		.input(waitlistInputSchema)
		.mutation(async ({ input }) => {
			try {
				const entry = await enqueueWaitlist({
					eventId: input.eventId,
					ticketTypeId: input.ticketTypeId ?? null,
					person: input.person,
					metadata: input.metadata ?? {},
				});
				return {
					id: entry.id,
					position: entry.position,
					status: entry.status,
				} as const;
			} catch (error) {
				if (error instanceof RegistrationError) {
					throwRegistrationError(error);
				}
				throw error;
			}
		}),
	attendees: router({
		list: adminProcedure.input(attendeeListInput).query(async ({ input }) => {
			const page = input.page ?? 1;
			const limit = input.limit ?? ATTENDEE_DEFAULT_PAGE_SIZE;
			const whereClauses = buildAttendeeWhereClauses(input);
			const whereCondition = and(...whereClauses);
			const orderByExpressions = (() => {
				switch (input.sort) {
					case "created_asc":
						return [asc(attendee.createdAt), asc(attendee.id)];
					case "check_in_desc":
						return [
							desc(attendee.checkInAt),
							desc(attendee.createdAt),
							desc(attendee.id),
						];
					default:
						return [desc(attendee.createdAt), desc(attendee.id)];
				}
			})();

			const [totalResult, rows] = await Promise.all([
				db
					.select({ value: count() })
					.from(attendee)
					.leftJoin(attendeeProfile, eq(attendeeProfile.id, attendee.profileId))
					.leftJoin(ticketType, eq(ticketType.id, attendee.ticketTypeId))
					.leftJoin(eventOrder, eq(eventOrder.id, attendee.orderId))
					.where(whereCondition),
				db
					.select(attendeeSelectionColumns)
					.from(attendee)
					.leftJoin(attendeeProfile, eq(attendeeProfile.id, attendee.profileId))
					.leftJoin(ticketType, eq(ticketType.id, attendee.ticketTypeId))
					.leftJoin(eventOrder, eq(eventOrder.id, attendee.orderId))
					.where(whereCondition)
					.orderBy(...orderByExpressions)
					.offset((page - 1) * limit)
					.limit(limit),
			]);

			const total = Number(totalResult.at(0)?.value ?? 0);
			const items = rows.map((row) =>
				mapAttendeeSelection(row as AttendeeSelection),
			);

			return { items, total, page, limit } as const;
		}),
		export: adminProcedure
			.input(attendeeExportInput)
			.mutation(async ({ input }) => {
				const whereClauses = buildAttendeeWhereClauses(input);
				const whereCondition = and(...whereClauses);
				const rows = await db
					.select(attendeeSelectionColumns)
					.from(attendee)
					.leftJoin(attendeeProfile, eq(attendeeProfile.id, attendee.profileId))
					.leftJoin(ticketType, eq(ticketType.id, attendee.ticketTypeId))
					.leftJoin(eventOrder, eq(eventOrder.id, attendee.orderId))
					.where(whereCondition)
					.orderBy(desc(attendee.createdAt), desc(attendee.id));

				const items = rows.map((row) =>
					mapAttendeeSelection(row as AttendeeSelection),
				);
				const csv = buildAttendeeCsv(items);
				const timestamp = new Date()
					.toISOString()
					.replace(/[:T]/g, "-")
					.split(".")[0];
				const filename = `attendees-${input.eventId}-${timestamp}.csv`;
				return { filename, csv, count: items.length } as const;
			}),
		updateStatus: adminProcedure
			.input(updateAttendeeStatusInput)
			.mutation(async ({ input }) => {
				const updates: Partial<typeof attendee.$inferInsert> = {
					status: input.status,
					updatedAt: new Date(),
				};
				if (input.status === "checked_in") {
					updates.checkInAt = new Date();
					updates.noShow = false;
				} else {
					updates.checkInAt = null;
					if (input.noShow === undefined) {
						updates.noShow = false;
					}
				}
				if (input.noShow !== undefined) {
					updates.noShow = input.noShow;
				}

				const [updated] = await db
					.update(attendee)
					.set(updates)
					.where(eq(attendee.id, input.attendeeId))
					.returning({ id: attendee.id });

				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Attendee not found",
					});
				}

				const rows = await db
					.select(attendeeSelectionColumns)
					.from(attendee)
					.leftJoin(attendeeProfile, eq(attendeeProfile.id, attendee.profileId))
					.leftJoin(ticketType, eq(ticketType.id, attendee.ticketTypeId))
					.leftJoin(eventOrder, eq(eventOrder.id, attendee.orderId))
					.where(eq(attendee.id, updated.id))
					.limit(1);

				const row = rows.at(0);
				if (!row) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Attendee not found",
					});
				}

				return mapAttendeeSelection(row as AttendeeSelection);
			}),
		announce: adminProcedure
			.input(bulkAnnouncementInput)
			.mutation(async ({ input }) => {
				const eventRecord = await fetchEventOrThrow(input.eventId);
				const filters: AttendeeExportInput = (() => {
					const base: AttendeeExportInput = { eventId: input.eventId };
					switch (input.audience) {
						case "registered":
							return {
								...base,
								status: ["registered", "reserved"],
							};
						case "checked_in":
							return { ...base, status: ["checked_in"] };
						case "not_checked_in":
							return {
								...base,
								status: ["registered", "reserved"],
								checkedIn: "not_checked_in",
							};
						case "waitlist":
							return { ...base, status: ["waitlisted"] };
						case "no_show":
							return {
								...base,
								status: ["registered", "checked_in", "reserved"],
								noShow: true,
							};
						default:
							return {
								...base,
								status: ["registered", "checked_in", "reserved"],
							};
					}
				})();

				const whereClauses = buildAttendeeWhereClauses(filters);
				const whereCondition = and(...whereClauses);
				const rows = await db
					.select(attendeeSelectionColumns)
					.from(attendee)
					.leftJoin(attendeeProfile, eq(attendeeProfile.id, attendee.profileId))
					.leftJoin(ticketType, eq(ticketType.id, attendee.ticketTypeId))
					.leftJoin(eventOrder, eq(eventOrder.id, attendee.orderId))
					.where(whereCondition);

				const items = rows
					.map((row) => mapAttendeeSelection(row as AttendeeSelection))
					.filter((item) => item.email);

				const seen = new Set<string>();
				const recipients = items.filter((item) => {
					if (!item.email) return false;
					const normalized = item.email.toLowerCase();
					if (seen.has(normalized)) return false;
					seen.add(normalized);
					return true;
				});

				if (recipients.length === 0) {
					return { queued: 0, total: items.length } as const;
				}

				const messaging = parseEventMessagingSettings(
					eventRecord.metadata as Record<string, unknown> | null | undefined,
				);
				const replyTo = messaging.replyToEmail ?? null;
				const { html, text, preview } = normalizeAnnouncementHtml(
					input.message,
				);

				await Promise.all(
					recipients.map((recipient) =>
						queueEmailDelivery({
							eventId: input.eventId,
							attendeeId: recipient.id,
							orderId: recipient.order?.id ?? null,
							recipientEmail: recipient.email ?? "",
							recipientName: recipient.name,
							type: "announcement",
							replyTo,
							subject: input.subject,
							metadata: {
								reason: "bulk_announcement",
								audience: input.audience,
								previewText: input.previewText ?? preview,
								bodyHtml: html,
								bodyText: text,
								attendeeId: recipient.id,
							},
						}),
					),
				);

				return { queued: recipients.length, total: items.length } as const;
			}),
	}),
	analytics: router({
		overview: adminProcedure
			.input(analyticsOverviewInput)
			.query(async ({ input }) => {
				const [attendeeSummary] = await db
					.select({
						total: count(),
						checkedIn: sql<number>`count(*) FILTER (WHERE ${attendee.status} = 'checked_in')`,
						registered: sql<number>`count(*) FILTER (WHERE ${attendee.status} = 'registered')`,
						reserved: sql<number>`count(*) FILTER (WHERE ${attendee.status} = 'reserved')`,
						waitlisted: sql<number>`count(*) FILTER (WHERE ${attendee.status} = 'waitlisted')`,
						cancelled: sql<number>`count(*) FILTER (WHERE ${attendee.status} = 'cancelled')`,
						noShow: sql<number>`count(*) FILTER (WHERE ${attendee.noShow} = true)`,
					})
					.from(attendee)
					.where(eq(attendee.eventId, input.eventId));

				const [orderSummary] = await db
					.select({
						totalOrders: count(),
						confirmedOrders: sql<number>`count(*) FILTER (WHERE ${eventOrder.status} = 'confirmed')`,
						revenueCents: sum(eventOrder.totalCents),
						currency: sql<string | null>`max(${eventOrder.currency})`,
					})
					.from(eventOrder)
					.where(eq(eventOrder.eventId, input.eventId));

				const totalRegistrations = Number(attendeeSummary?.total ?? 0);
				const checkedIn = Number(attendeeSummary?.checkedIn ?? 0);
				const registered = Number(attendeeSummary?.registered ?? 0);
				const reserved = Number(attendeeSummary?.reserved ?? 0);
				const waitlisted = Number(attendeeSummary?.waitlisted ?? 0);
				const cancelled = Number(attendeeSummary?.cancelled ?? 0);
				const noShow = Number(attendeeSummary?.noShow ?? 0);
				const totalOrders = Number(orderSummary?.totalOrders ?? 0);
				const confirmedOrders = Number(orderSummary?.confirmedOrders ?? 0);
				const revenueCents = Number(orderSummary?.revenueCents ?? 0);
				const attendanceBase = totalRegistrations > 0 ? totalRegistrations : 1;
				const attendanceRate = checkedIn / attendanceBase;
				const conversionBase = totalOrders > 0 ? totalOrders : 1;
				const conversionRate = confirmedOrders / conversionBase;

				return {
					totals: {
						registrations: totalRegistrations,
						checkedIn,
						registered,
						reserved,
						waitlisted,
						cancelled,
						noShow,
					},
					orders: {
						total: totalOrders,
						confirmed: confirmedOrders,
						conversionRate,
					},
					revenue: {
						cents: revenueCents,
						currency: orderSummary?.currency ?? "usd",
					},
					attendanceRate,
				} as const;
			}),
		timeseries: adminProcedure
			.input(analyticsTimeseriesInput)
			.query(async ({ input }) => {
				const { start, end } = ensureDateRange(input, input.interval);
				const registrationBucket =
					input.interval === "week"
						? sql<Date>`date_trunc('week', ${attendee.createdAt})`
						: sql<Date>`date_trunc('day', ${attendee.createdAt})`;
				const checkInBucket =
					input.interval === "week"
						? sql<Date>`date_trunc('week', ${attendee.checkInAt})`
						: sql<Date>`date_trunc('day', ${attendee.checkInAt})`;
				const revenueBucket =
					input.interval === "week"
						? sql<Date>`date_trunc('week', ${eventOrder.createdAt})`
						: sql<Date>`date_trunc('day', ${eventOrder.createdAt})`;

				const registrations = await db
					.select({ bucket: registrationBucket, value: count() })
					.from(attendee)
					.where(
						and(
							eq(attendee.eventId, input.eventId),
							gte(attendee.createdAt, start),
							lte(attendee.createdAt, end),
						),
					)
					.groupBy(registrationBucket)
					.orderBy(registrationBucket);

				const checkIns = await db
					.select({ bucket: checkInBucket, value: count() })
					.from(attendee)
					.where(
						and(
							eq(attendee.eventId, input.eventId),
							not(isNull(attendee.checkInAt)),
							gte(attendee.checkInAt, start),
							lte(attendee.checkInAt, end),
						),
					)
					.groupBy(checkInBucket)
					.orderBy(checkInBucket);

				const revenueRows = await db
					.select({
						bucket: revenueBucket,
						revenueCents: sum(eventOrder.totalCents),
						confirmed: sql<number>`count(*) FILTER (WHERE ${eventOrder.status} = 'confirmed')`,
					})
					.from(eventOrder)
					.where(
						and(
							eq(eventOrder.eventId, input.eventId),
							gte(eventOrder.createdAt, start),
							lte(eventOrder.createdAt, end),
						),
					)
					.groupBy(revenueBucket)
					.orderBy(revenueBucket);

				const registrationMap = new Map<string, number>();
				for (const row of registrations) {
					const key = row.bucket?.toISOString();
					if (key) {
						registrationMap.set(key, Number(row.value ?? 0));
					}
				}
				const checkInMap = new Map<string, number>();
				for (const row of checkIns) {
					const key = row.bucket?.toISOString();
					if (key) {
						checkInMap.set(key, Number(row.value ?? 0));
					}
				}
				const revenueMap = new Map<
					string,
					{ revenue: number; confirmed: number }
				>();
				for (const row of revenueRows) {
					const key = row.bucket?.toISOString();
					if (key) {
						revenueMap.set(key, {
							revenue: Number(row.revenueCents ?? 0),
							confirmed: Number(row.confirmed ?? 0),
						});
					}
				}

				const buckets = generateSeriesBuckets(start, end, input.interval);
				const points: AnalyticsTimeseriesPoint[] = buckets.map((bucket) => {
					const key = bucket.toISOString();
					const revenueEntry = revenueMap.get(key) ?? {
						revenue: 0,
						confirmed: 0,
					};
					return {
						bucket: key,
						registrations: registrationMap.get(key) ?? 0,
						checkIns: checkInMap.get(key) ?? 0,
						revenueCents: revenueEntry.revenue,
						confirmedOrders: revenueEntry.confirmed,
					} satisfies AnalyticsTimeseriesPoint;
				});

				return {
					start: start.toISOString(),
					end: end.toISOString(),
					interval: input.interval,
					points,
				} as const;
			}),
	}),
	stats: adminProcedure
		.input(statsInputSchema.optional())
		.query(async ({ input }) => {
			const filters = input ?? {};
			const whereClauses = buildEventFilters(filters);

			const grouped = await db
				.select({
					status: event.status,
					value: count(event.id),
				})
				.from(event)
				.where(whereClauses.length ? and(...whereClauses) : undefined)
				.groupBy(event.status);

			const byStatus = Object.fromEntries(
				event.status.enumValues.map((status) => [
					status,
					grouped.find((row) => row.status === status)?.value ?? 0,
				]),
			) as Record<(typeof event.status.enumValues)[number], number>;

			const total = Object.values(byStatus).reduce(
				(acc, value) => acc + value,
				0,
			);

			return {
				total,
				byStatus,
			} as const;
		}),
});
