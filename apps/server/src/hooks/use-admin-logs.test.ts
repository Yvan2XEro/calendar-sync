import { describe, expect, it } from "bun:test";
import type { InfiniteData } from "@tanstack/react-query";

import {
	type LogEntry,
	type LogListResult,
	mergeLogsIntoPages,
} from "./use-admin-logs";

function createLog(id: number, overrides: Partial<LogEntry> = {}): LogEntry {
	const base: LogEntry = {
		id,
		ts: new Date(id * 1000).toISOString(),
		level: "info",
		providerId: null,
		sessionId: null,
		msg: `log-${id}`,
		data: null,
	} satisfies LogEntry;

	return {
		...base,
		...overrides,
	};
}

describe("mergeLogsIntoPages", () => {
	it("adds logs when no existing pages are cached", () => {
		const result = mergeLogsIntoPages(undefined, [createLog(1)]);

		expect(result.pages[0]?.logs.map((log) => log.id)).toEqual([1]);
	});

	it("prepends logs to the first page and removes duplicates from later pages", () => {
		const existing: InfiniteData<LogListResult> = {
			pageParams: [undefined],
			pages: [
				{
					logs: [createLog(2)],
					nextCursor: 123,
				},
				{
					logs: [createLog(3), createLog(1)],
					nextCursor: null,
				},
			],
		};

		const incoming = [createLog(4), createLog(1)];

		const result = mergeLogsIntoPages(existing, incoming);

		expect(result.pages[0]?.logs.map((log) => log.id)).toEqual([4, 1, 2]);
		expect(result.pages[1]?.logs.map((log) => log.id)).toEqual([3]);
	});

	it("ignores duplicate incoming ids while preserving newest-first ordering", () => {
		const incoming = [createLog(5), createLog(5), createLog(4)];
		const result = mergeLogsIntoPages(undefined, incoming);

		expect(result.pages[0]?.logs.map((log) => log.id)).toEqual([5, 4]);
	});
});
