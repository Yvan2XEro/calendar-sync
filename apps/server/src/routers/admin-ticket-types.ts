import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { event, ticketType } from "@/db/schema/app";
import { adminProcedure, router } from "@/lib/trpc";

const DEFAULT_PAGE_SIZE = 25;

const listInput = z.object({
	q: z.string().trim().min(1).optional(),
	status: z.enum(ticketType.status.enumValues).optional(),
	eventId: z.string().trim().min(1).optional(),
	page: z.number().int().min(1).optional(),
	pageSize: z.number().int().min(1).max(100).optional(),
});

type ListInput = z.infer<typeof listInput>;

type TicketTypeListItem = {
	id: string;
	name: string;
	description: string | null;
	priceCents: number;
	currency: string;
	capacity: number | null;
	maxPerOrder: number | null;
	status: (typeof ticketType.status.enumValues)[number];
	isWaitlistEnabled: boolean;
	salesStartAt: Date | null;
	salesEndAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	event: {
		id: string;
		title: string;
		slug: string;
		status: (typeof event.status.enumValues)[number];
	};
};

export const adminTicketTypesRouter = router({
	list: adminProcedure.input(listInput.optional()).query(async ({ input }) => {
		const {
			q,
			status,
			eventId,
			page = 1,
			pageSize = DEFAULT_PAGE_SIZE,
		}: ListInput = input ?? {};

		const offset = (page - 1) * pageSize;
		const whereClauses: SQL[] = [];

		if (status) {
			whereClauses.push(eq(ticketType.status, status));
		}

		if (eventId) {
			whereClauses.push(eq(ticketType.eventId, eventId));
		}

		if (q) {
			const searchTerm = `%${q}%`;
			const searchClause = or(
				ilike(ticketType.name, searchTerm),
				ilike(event.title, searchTerm),
				eq(ticketType.id, q),
			);
			if (searchClause) {
				whereClauses.push(searchClause);
			}
		}

		const where = whereClauses.length ? and(...whereClauses) : undefined;

		const baseRowsQuery = db
			.select({
				id: ticketType.id,
				name: ticketType.name,
				description: ticketType.description,
				priceCents: ticketType.priceCents,
				currency: ticketType.currency,
				capacity: ticketType.capacity,
				maxPerOrder: ticketType.maxPerOrder,
				status: ticketType.status,
				isWaitlistEnabled: ticketType.isWaitlistEnabled,
				salesStartAt: ticketType.salesStartAt,
				salesEndAt: ticketType.salesEndAt,
				createdAt: ticketType.createdAt,
				updatedAt: ticketType.updatedAt,
				eventId: event.id,
				eventTitle: event.title,
				eventSlug: event.slug,
				eventStatus: event.status,
			})
			.from(ticketType)
			.innerJoin(event, eq(event.id, ticketType.eventId));

		const rowsPromise = (where ? baseRowsQuery.where(where) : baseRowsQuery)
			.orderBy(desc(ticketType.createdAt))
			.limit(pageSize)
			.offset(offset);

		const baseCountQuery = db
			.select({ value: count() })
			.from(ticketType)
			.innerJoin(event, eq(event.id, ticketType.eventId));

		const countPromise = where ? baseCountQuery.where(where) : baseCountQuery;

		const [rows, totalResult] = await Promise.all([rowsPromise, countPromise]);

		const items: TicketTypeListItem[] = rows.map((row) => ({
			id: row.id,
			name: row.name,
			description: row.description ?? null,
			priceCents: row.priceCents,
			currency: row.currency,
			capacity: row.capacity,
			maxPerOrder: row.maxPerOrder,
			status: row.status,
			isWaitlistEnabled: row.isWaitlistEnabled,
			salesStartAt: row.salesStartAt,
			salesEndAt: row.salesEndAt,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			event: {
				id: row.eventId,
				title: row.eventTitle,
				slug: row.eventSlug,
				status: row.eventStatus,
			},
		}));

		const total = totalResult[0]?.value ?? 0;
		const totalPages = Math.max(1, Math.ceil(total / pageSize));

		return {
			items,
			page,
			pageSize,
			total,
			totalPages,
		};
	}),
});
