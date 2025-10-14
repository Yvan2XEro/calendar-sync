import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
	type DigestSchedule as DigestScheduleRecord,
	digestSchedule,
	digestSegment,
	event,
	eventEmailDelivery,
	organizationProvider,
	provider,
} from "@/db/schema/app";
import { member, organization, user } from "@/db/schema/auth";
import { formatDisplayDate } from "@/lib/datetime";
import { buildAbsoluteUrl } from "@/lib/site-metadata";

import { queueEmailDelivery } from "./deliveries";

export type DigestSegmentValue = (typeof digestSegment.enumValues)[number];

export type DigestMetadata = {
	version: 1;
	userId?: string;
	summary?: {
		totalEvents: number;
		organizationCount: number;
		windowStart: string;
		windowEnd: string;
		generatedAt: string;
	};
	segments?: Array<{
		segment: DigestSegmentValue;
		organizations: Array<{
			id: string;
			name: string;
			slug: string | null;
			events: Array<{
				id: string;
				title: string;
				startAt: string;
				endAt: string | null;
				location: string | null;
				url: string | null;
				slug: string | null;
				canonicalUrl: string | null;
			}>;
		}>;
	}>;
	content: {
		subject: string;
		previewText: string | null;
		html: string;
		text: string;
	};
};

export const DIGEST_SEGMENTS: DigestSegmentValue[] = [
	...digestSegment.enumValues,
];
export const DEFAULT_DIGEST_LOOKAHEAD_DAYS = 14;
export const DEFAULT_DIGEST_CADENCE_HOURS = 168;
const MAX_EVENTS_PER_SEGMENT = 12;
const MAX_EVENTS_PER_ORGANIZATION = 5;

const SEGMENT_LABELS: Record<
	DigestSegmentValue,
	{ title: string; description: string }
> = {
	joined: {
		title: "From your organizations",
		description: "Updates from groups you've already joined.",
	},
	discover: {
		title: "Discover new groups",
		description: "Highlights from organizations you might enjoy.",
	},
};

const GREETING_FALLBACK = "there";

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function safeUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		return new URL(value).toString();
	} catch {
		return null;
	}
}

function formatDateRange(start: Date, end: Date): string {
	const startTime = start.getTime();
	const endTime = end.getTime();
	if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
		return "";
	}
	if (startTime === endTime) {
		return format(start, "MMM d, yyyy");
	}
	if (start.getFullYear() === end.getFullYear()) {
		if (start.getMonth() === end.getMonth()) {
			return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
		}
		return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
	}
	return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
}

function buildPreviewText(
	totalEvents: number,
	organizationCount: number,
	range: string,
) {
	const eventLabel = `${totalEvents} upcoming event${totalEvents === 1 ? "" : "s"}`;
	const orgLabel = `${organizationCount} organization${organizationCount === 1 ? "" : "s"}`;
	return `${eventLabel} across ${orgLabel} through ${range}`;
}

type SegmentGroup = {
	segment: DigestSegmentValue;
	organizations: Array<{
		organization: {
			id: string;
			name: string;
			slug: string | null;
		};
		events: Array<{
			id: string;
			title: string;
			startAt: Date;
			endAt: Date | null;
			location: string | null;
			url: string | null;
			slug: string | null;
			canonicalUrl: string | null;
		}>;
	}>;
};

type ComposeInput = {
	user: { id: string; email: string; name: string | null };
	schedules: DigestScheduleRecord[];
	now: Date;
	limitPerSegment?: number;
	maxPerOrganization?: number;
};

type ComposeResult = {
	subject: string;
	previewText: string | null;
	html: string;
	text: string;
	anchorEventId: string;
	segments: SegmentGroup[];
	totalEvents: number;
	organizationCount: number;
	windowStart: Date;
	windowEnd: Date;
};

async function ensureSchedules(): Promise<DigestScheduleRecord[]> {
	const existing = await db.select().from(digestSchedule);
	const existingSegments = new Set(existing.map((item) => item.segment));
	const missing = DIGEST_SEGMENTS.filter(
		(segment) => !existingSegments.has(segment),
	);

	if (missing.length === 0) {
		return existing;
	}

	const now = new Date();
	const defaults = missing.map(
		(segment) =>
			({
				id: randomUUID(),
				segment,
				enabled: false,
				cadenceHours: DEFAULT_DIGEST_CADENCE_HOURS,
				lookaheadDays: DEFAULT_DIGEST_LOOKAHEAD_DAYS,
				metadata: {},
				createdAt: now,
				updatedAt: now,
			}) satisfies typeof digestSchedule.$inferInsert,
	);

	if (defaults.length) {
		await db
			.insert(digestSchedule)
			.values(defaults)
			.onConflictDoNothing({ target: digestSchedule.segment });
	}

	return await db.select().from(digestSchedule);
}

function scheduleIsDue(schedule: DigestScheduleRecord, now: Date): boolean {
	if (!schedule.enabled) return false;
	if (!schedule.lastSentAt) return true;
	const next = new Date(
		schedule.lastSentAt.getTime() + schedule.cadenceHours * 60 * 60 * 1000,
	);
	return next.getTime() <= now.getTime();
}

type SegmentQueryRow = {
	eventId: string;
	title: string;
	startAt: Date;
	endAt: Date | null;
	location: string | null;
	url: string | null;
	slug: string | null;
	organizationId: string;
	organizationName: string;
	organizationSlug: string | null;
};

async function fetchSegmentRows(
	segment: DigestSegmentValue,
	userId: string,
	windowStart: Date,
	windowEnd: Date,
	limit: number,
): Promise<SegmentQueryRow[]> {
	const baseConditions = and(
		eq(event.status, "approved"),
		eq(event.isPublished, true),
		gte(event.startAt, windowStart),
		lte(event.startAt, windowEnd),
	);

	if (segment === "joined") {
		return await db
			.select({
				eventId: event.id,
				title: event.title,
				startAt: event.startAt,
				endAt: event.endAt,
				location: event.location,
				url: event.url,
				slug: event.slug,
				organizationId: organization.id,
				organizationName: organization.name,
				organizationSlug: organization.slug,
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
			.where(baseConditions)
			.orderBy(event.startAt, event.id)
			.limit(limit);
	}

	const membership = alias(member, "digest_membership");
	return await db
		.select({
			eventId: event.id,
			title: event.title,
			startAt: event.startAt,
			endAt: event.endAt,
			location: event.location,
			url: event.url,
			slug: event.slug,
			organizationId: organization.id,
			organizationName: organization.name,
			organizationSlug: organization.slug,
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
		.leftJoin(
			membership,
			and(
				eq(membership.organizationId, organization.id),
				eq(membership.userId, userId),
			),
		)
		.where(and(baseConditions, isNull(membership.id)))
		.orderBy(event.startAt, event.id)
		.limit(limit);
}

function mapRowsToGroups(
	segment: DigestSegmentValue,
	rows: SegmentQueryRow[],
	limitPerSegment: number,
	maxPerOrganization: number,
): SegmentGroup {
	const organizationMap = new Map<
		string,
		{
			organization: {
				id: string;
				name: string;
				slug: string | null;
			};
			events: SegmentGroup["organizations"][number]["events"];
		}
	>();

	for (const row of rows) {
		const orgId = row.organizationId;
		if (!organizationMap.has(orgId)) {
			organizationMap.set(orgId, {
				organization: {
					id: row.organizationId,
					name: row.organizationName,
					slug: row.organizationSlug,
				},
				events: [],
			});
		}
		const entry = organizationMap.get(orgId);
		if (!entry) continue;
		if (entry.events.length >= maxPerOrganization) continue;
		const slug = row.slug?.trim() ?? null;
		entry.events.push({
			id: row.eventId,
			title: row.title,
			startAt: row.startAt,
			endAt: row.endAt,
			location: row.location,
			url: row.url,
			slug,
			canonicalUrl: slug ? buildAbsoluteUrl(`/events/${slug}`) : null,
		});
	}

	const organizations = Array.from(organizationMap.values())
		.map((item) => ({
			organization: item.organization,
			events: item.events.sort(
				(a, b) => a.startAt.getTime() - b.startAt.getTime(),
			),
		}))
		.filter((entry) => entry.events.length > 0)
		.sort(
			(a, b) => a.events[0]?.startAt.getTime() - b.events[0]?.startAt.getTime(),
		);

	if (Number.isFinite(limitPerSegment) && limitPerSegment >= 0) {
		let eventCount = 0;
		for (const entry of organizations) {
			if (eventCount >= limitPerSegment) {
				entry.events = [];
				continue;
			}
			const remaining = limitPerSegment - eventCount;
			if (entry.events.length > remaining) {
				entry.events = entry.events.slice(0, remaining);
				eventCount = limitPerSegment;
			} else {
				eventCount += entry.events.length;
			}
		}
	}

	const filtered = organizations.filter((entry) => entry.events.length > 0);
	return { segment, organizations: filtered } satisfies SegmentGroup;
}

async function composeDigestEmail({
	user,
	schedules,
	now,
	limitPerSegment = MAX_EVENTS_PER_SEGMENT,
	maxPerOrganization = MAX_EVENTS_PER_ORGANIZATION,
}: ComposeInput): Promise<ComposeResult | null> {
	const segments: SegmentGroup[] = [];
	let totalEvents = 0;
	let organizationCount = 0;
	let earliestEvent: { id: string; startAt: Date } | null = null;
	let latestEventDate: Date | null = null;

	for (const schedule of schedules) {
		const lookaheadDays =
			schedule.lookaheadDays ?? DEFAULT_DIGEST_LOOKAHEAD_DAYS;
		const windowEnd = new Date(
			now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000,
		);
		const queryLimit = Math.max(limitPerSegment * 3, limitPerSegment);
		const rows = await fetchSegmentRows(
			schedule.segment,
			user.id,
			now,
			windowEnd,
			queryLimit,
		);
		if (!rows.length) {
			continue;
		}
		const group = mapRowsToGroups(
			schedule.segment,
			rows,
			limitPerSegment,
			maxPerOrganization,
		);
		if (!group.organizations.length) {
			continue;
		}
		segments.push(group);
		organizationCount += group.organizations.length;
		for (const org of group.organizations) {
			for (const eventItem of org.events) {
				totalEvents += 1;
				if (
					!earliestEvent ||
					eventItem.startAt.getTime() < earliestEvent.startAt.getTime()
				) {
					earliestEvent = {
						id: eventItem.id,
						startAt: eventItem.startAt,
					};
				}
				if (
					!latestEventDate ||
					eventItem.startAt.getTime() > latestEventDate.getTime()
				) {
					latestEventDate = eventItem.startAt;
				}
			}
		}
	}

	if (!segments.length || !earliestEvent) {
		return null;
	}

	const windowStart = earliestEvent.startAt;
	const windowEnd = latestEventDate ?? earliestEvent.startAt;
	const rangeLabel = formatDateRange(windowStart, windowEnd);
	const subject = `Upcoming events digest · ${rangeLabel}`;
	const previewText = buildPreviewText(
		totalEvents,
		organizationCount,
		rangeLabel,
	);
	const html = renderDigestHtml({ user, segments, rangeLabel, previewText });
	const text = renderDigestText({ user, segments, rangeLabel, previewText });

	return {
		subject,
		previewText,
		html,
		text,
		anchorEventId: earliestEvent.id,
		segments,
		totalEvents,
		organizationCount,
		windowStart,
		windowEnd,
	} satisfies ComposeResult;
}

type RenderInput = {
	user: { id: string; email: string; name: string | null };
	segments: SegmentGroup[];
	rangeLabel: string;
	previewText: string | null;
};

export function renderDigestHtml({ user, segments, rangeLabel }: RenderInput) {
	const htmlParts: string[] = [];
	htmlParts.push(
		"<div style=\"font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1f2933;\">",
	);
	const greetingName = user.name?.trim() ?? GREETING_FALLBACK;
	htmlParts.push(`<p>Hi ${escapeHtml(greetingName)},</p>`);
	htmlParts.push(
		`<p>Here’s what’s coming up between <strong>${escapeHtml(rangeLabel)}</strong>.</p>`,
	);
	for (const segment of segments) {
		const label = SEGMENT_LABELS[segment.segment];
		htmlParts.push(
			`<h2 style="margin-top: 24px; margin-bottom: 8px; font-size: 18px; font-weight: 600;">${escapeHtml(label.title)}</h2>`,
		);
		htmlParts.push(
			`<p style="margin-top: 0; margin-bottom: 16px; color: #4b5563;">${escapeHtml(label.description)}</p>`,
		);
		for (const org of segment.organizations) {
			htmlParts.push(
				`<div style="margin-bottom: 16px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #f9fafb;">`,
			);
			htmlParts.push(
				`<h3 style="margin: 0 0 12px; font-size: 16px; font-weight: 600;">${escapeHtml(org.organization.name)}</h3>`,
			);
			htmlParts.push('<ul style="margin: 0; padding-left: 16px;">');
			for (const eventItem of org.events) {
				const eventUrl =
					safeUrl(eventItem.canonicalUrl) ?? safeUrl(eventItem.url);
				const location = eventItem.location?.trim();
				htmlParts.push('<li style="margin-bottom: 12px;">');
				htmlParts.push(
					`<div style="font-weight: 600; color: #111827;">${escapeHtml(eventItem.title)}</div>`,
				);
				htmlParts.push(
					`<div style="color: #374151;">${escapeHtml(formatDisplayDate(eventItem.startAt))}</div>`,
				);
				if (location) {
					htmlParts.push(
						`<div style="color: #4b5563;">Location: ${escapeHtml(location)}</div>`,
					);
				}
				if (eventUrl) {
					htmlParts.push(
						`<div><a href="${escapeHtml(eventUrl)}" style="color: #2563eb;">View details</a></div>`,
					);
				}
				htmlParts.push("</li>");
			}
			htmlParts.push("</ul>");
			htmlParts.push("</div>");
		}
	}
	htmlParts.push(
		'<p style="margin-top: 24px; color: #4b5563;">You’re receiving this digest because your workspace enabled upcoming event summaries. Visit your dashboard to adjust notification preferences.</p>',
	);
	htmlParts.push("</div>");
	return htmlParts.join("");
}

export function renderDigestText({ user, segments, rangeLabel }: RenderInput) {
	const textParts: string[] = [];
	const greetingName = user.name?.trim() ?? GREETING_FALLBACK;
	textParts.push(`Hi ${greetingName},`);
	textParts.push(`Here’s what’s coming up between ${rangeLabel}.`);
	for (const segment of segments) {
		const label = SEGMENT_LABELS[segment.segment];
		textParts.push("");
		textParts.push(label.title.toUpperCase());
		textParts.push(label.description);
		for (const org of segment.organizations) {
			textParts.push("");
			textParts.push(`- ${org.organization.name}`);
			for (const eventItem of org.events) {
				textParts.push(
					`  • ${eventItem.title} (${formatDisplayDate(eventItem.startAt)})`,
				);
				if (eventItem.location?.trim()) {
					textParts.push(`    Location: ${eventItem.location.trim()}`);
				}
				const detailUrl =
					eventItem.canonicalUrl?.trim() ?? eventItem.url?.trim();
				if (detailUrl) {
					textParts.push(`    Details: ${detailUrl}`);
				}
			}
		}
	}
	textParts.push("");
	textParts.push(
		"You’re receiving this digest because your workspace enabled upcoming event summaries.",
	);
	return textParts.join("\n");
}

export function parseDigestMetadata(value: unknown): DigestMetadata | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const envelope = (value as Record<string, unknown>).digest ?? value;
	if (!envelope || typeof envelope !== "object") {
		return null;
	}
	const record = envelope as Record<string, unknown>;
	const content = record.content;
	if (!content || typeof content !== "object") {
		return null;
	}
	const subject = (content as Record<string, unknown>).subject;
	const html = (content as Record<string, unknown>).html;
	const text = (content as Record<string, unknown>).text;
	const previewText = (content as Record<string, unknown>).previewText;
	if (
		typeof subject !== "string" ||
		typeof html !== "string" ||
		typeof text !== "string"
	) {
		return null;
	}
	return {
		version: 1,
		userId: typeof record.userId === "string" ? record.userId : undefined,
		summary: record.summary as DigestMetadata["summary"],
		segments: record.segments as DigestMetadata["segments"],
		content: {
			subject,
			html,
			text,
			previewText:
				typeof previewText === "string" && previewText.trim().length
					? previewText
					: null,
		},
	} satisfies DigestMetadata;
}

type ScheduleDigestOptions = {
	now?: Date;
	limitPerSegment?: number;
	maxPerOrganization?: number;
	limitUsers?: number;
};

type ScheduleDigestResult = {
	queued: number;
	segmentsProcessed: DigestSegmentValue[];
	segmentsWithEvents: DigestSegmentValue[];
	recipientsConsidered: number;
};

async function hasPendingDigest(recipientEmail: string, now: Date) {
	const existing = await db
		.select({ id: eventEmailDelivery.id })
		.from(eventEmailDelivery)
		.where(
			and(
				eq(eventEmailDelivery.recipientEmail, recipientEmail),
				eq(eventEmailDelivery.type, "digest"),
				inArray(eventEmailDelivery.status, ["pending", "sending"]),
				gte(
					eventEmailDelivery.scheduledAt,
					new Date(now.getTime() - 6 * 60 * 60 * 1000),
				),
			),
		)
		.limit(1);
	return existing.length > 0;
}

export async function scheduleDigestDeliveries({
	now = new Date(),
	limitPerSegment,
	maxPerOrganization,
	limitUsers,
}: ScheduleDigestOptions = {}): Promise<ScheduleDigestResult> {
	const schedules = await ensureSchedules();
	const dueSchedules = schedules.filter((schedule) =>
		scheduleIsDue(schedule, now),
	);
	if (!dueSchedules.length) {
		return {
			queued: 0,
			segmentsProcessed: [],
			segmentsWithEvents: [],
			recipientsConsidered: 0,
		};
	}
	const userQueryBase = db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			banned: user.banned,
		})
		.from(user)
		.orderBy(user.createdAt);
	const usersToProcess = await (limitUsers && limitUsers > 0
		? userQueryBase.limit(limitUsers)
		: userQueryBase);
	let queued = 0;
	let recipientsConsidered = 0;
	const segmentsWithEvents = new Set<DigestSegmentValue>();
	for (const recipient of usersToProcess) {
		if (!recipient.email) continue;
		if (recipient.banned) continue;
		if (await hasPendingDigest(recipient.email, now)) {
			continue;
		}
		const composeResult = await composeDigestEmail({
			user: { id: recipient.id, email: recipient.email, name: recipient.name },
			schedules: dueSchedules,
			now,
			limitPerSegment,
			maxPerOrganization,
		});
		recipientsConsidered += 1;
		if (!composeResult) {
			continue;
		}
		for (const segment of composeResult.segments) {
			segmentsWithEvents.add(segment.segment);
		}
		const metadata: DigestMetadata = {
			version: 1,
			userId: recipient.id,
			summary: {
				totalEvents: composeResult.totalEvents,
				organizationCount: composeResult.organizationCount,
				windowStart: composeResult.windowStart.toISOString(),
				windowEnd: composeResult.windowEnd.toISOString(),
				generatedAt: now.toISOString(),
			},
			segments: composeResult.segments.map((segment) => ({
				segment: segment.segment,
				organizations: segment.organizations.map((org) => ({
					id: org.organization.id,
					name: org.organization.name,
					slug: org.organization.slug,
					events: org.events.map((eventItem) => ({
						id: eventItem.id,
						title: eventItem.title,
						startAt: eventItem.startAt.toISOString(),
						endAt: eventItem.endAt?.toISOString() ?? null,
						location: eventItem.location,
						url: eventItem.url,
						slug: eventItem.slug,
						canonicalUrl: eventItem.canonicalUrl,
					})),
				})),
			})),
			content: {
				subject: composeResult.subject,
				previewText: composeResult.previewText,
				html: composeResult.html,
				text: composeResult.text,
			},
		} satisfies DigestMetadata;
		const inserted = await queueEmailDelivery({
			eventId: composeResult.anchorEventId,
			recipientEmail: recipient.email,
			recipientName: recipient.name ?? null,
			type: "digest",
			metadata: { digest: metadata },
			subject: composeResult.subject,
			scheduledAt: now,
		});
		if (inserted) {
			queued += 1;
		}
	}
	if (dueSchedules.length) {
		const summaryMetadata = {
			lastQueuedRecipients: queued,
			lastAttemptAt: now.toISOString(),
			segmentsWithEvents: Array.from(segmentsWithEvents),
		} as Record<string, unknown>;
		await db
			.update(digestSchedule)
			.set({
				lastSentAt: now,
				metadata: summaryMetadata,
				updatedAt: now,
			})
			.where(
				inArray(
					digestSchedule.id,
					dueSchedules.map((schedule) => schedule.id),
				),
			);
	}
	return {
		queued,
		segmentsProcessed: dueSchedules.map((schedule) => schedule.segment),
		segmentsWithEvents: Array.from(segmentsWithEvents),
		recipientsConsidered,
	} satisfies ScheduleDigestResult;
}
