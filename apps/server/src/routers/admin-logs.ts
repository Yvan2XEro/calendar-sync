import { and, desc, eq, gt, lt, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { workerLog } from "@/db/schema/app";
import { adminProcedure, router } from "@/lib/trpc";

const DEFAULT_PAGE_SIZE = 50;

const filterSchema = z.object({
	providerId: z.string().trim().min(1).optional(),
	level: z.string().trim().min(1).optional(),
	cursor: z.number().int().positive().optional(),
	limit: z.number().int().min(1).max(200).optional(),
	since: z
		.string()
		.datetime({ offset: true })
		.optional()
		.transform((value) => (value ? new Date(value) : undefined)),
});

export const adminLogsRouter = router({
	list: adminProcedure
		.input(filterSchema.optional())
		.query(async ({ input }) => {
                        const filters = input ?? ({} as z.infer<typeof filterSchema>);
                        const {
                                limit = DEFAULT_PAGE_SIZE,
                                providerId,
                                level,
                                since,
                                cursor,
                        } = filters;

                        const whereClauses: SQL[] = [];

                        if (providerId) {
                                whereClauses.push(eq(workerLog.providerId, providerId));
                        }

                        if (level) {
                                whereClauses.push(eq(workerLog.level, level));
                        }

                        if (since) {
                                whereClauses.push(gt(workerLog.ts, since));
                        }

                        if (cursor) {
                                whereClauses.push(lt(workerLog.id, cursor));
                        }

			const rows = await db
				.select()
				.from(workerLog)
				.where(whereClauses.length ? and(...whereClauses) : undefined)
				.orderBy(desc(workerLog.id))
				.limit(limit + 1);

			const hasMore = rows.length > limit;
			const limitedRows = hasMore ? rows.slice(0, limit) : rows;

			const logs = limitedRows.map((row) => ({
				...row,
				data: row.data ?? null,
			}));

			const nextCursor = hasMore ? (logs[logs.length - 1]?.id ?? null) : null;

			return {
				logs,
				nextCursor,
			};
		}),
});
