import { and, asc, eq, gt, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { handle } from "hono/vercel";

import { db } from "@/db";
import { workerLog } from "@/db/schema/app";
import { createContext } from "@/lib/context";

const app = new Hono();

app.use(async (c, next) => {
	const context = await createContext(c.req.raw);

	if (!context.session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

        const userRole = (context.session.user as typeof context.session.user & {
                role?: string | null;
        })?.role;
        const roles = userRole ? [userRole] : [];

        if (!roles.includes("admin")) {
                return c.json({ error: "Forbidden" }, 403);
        }

	c.set("session", context.session);
	await next();
});

app.get(async (c) => {
	const url = new URL(c.req.url);
	const providerId = url.searchParams.get("providerId") ?? undefined;
	const level = url.searchParams.get("level") ?? undefined;
	const sinceParam = url.searchParams.get("since") ?? undefined;

	const parsedSince = sinceParam ? new Date(sinceParam) : undefined;
	const since =
		parsedSince && !Number.isNaN(parsedSince.valueOf())
			? parsedSince
			: undefined;

	const lastEventIdHeader = c.req.header("last-event-id");
	let lastSeenId = lastEventIdHeader ? Number(lastEventIdHeader) : undefined;

	if (Number.isNaN(lastSeenId)) {
		lastSeenId = undefined;
	}

	let lastSeenTs = since ?? (lastSeenId ? undefined : new Date());

	return streamSSE(c, async (stream) => {
		let active = true;
		const abortSignal = c.req.raw.signal;

		const heartbeat = setInterval(() => {
			void stream.writeSSE({ event: "ping", data: "" });
		}, 15000);

		abortSignal.addEventListener("abort", () => {
			active = false;
			clearInterval(heartbeat);
		});

		const fetchAndSend = async () => {
			if (!active) return;

			const whereClauses: SQL[] = [];

			if (providerId) {
				whereClauses.push(eq(workerLog.providerId, providerId));
			}

			if (level) {
				whereClauses.push(eq(workerLog.level, level));
			}

			if (lastSeenId != null) {
				whereClauses.push(gt(workerLog.id, lastSeenId));
			} else if (lastSeenTs) {
				whereClauses.push(gt(workerLog.ts, lastSeenTs));
			}

			const rows = await db
				.select()
				.from(workerLog)
				.where(whereClauses.length ? and(...whereClauses) : undefined)
				.orderBy(asc(workerLog.id))
				.limit(100);

			for (const row of rows) {
				if (!active) {
					break;
				}

				lastSeenId = row.id;
				lastSeenTs = row.ts instanceof Date ? row.ts : new Date(row.ts);

				try {
					await stream.writeSSE({
						id: row.id.toString(),
						event: "log",
						data: JSON.stringify({
							id: row.id,
							ts: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
							level: row.level,
							providerId: row.providerId,
							sessionId: row.sessionId,
							msg: row.msg,
							data: row.data,
						}),
					});
				} catch (error) {
					active = false;
					break;
				}
			}
		};

		try {
			await fetchAndSend();

			while (active) {
				await stream.sleep(2000);
				await fetchAndSend();
			}
		} finally {
			clearInterval(heartbeat);
		}
	});
});

export const GET = handle(app);
