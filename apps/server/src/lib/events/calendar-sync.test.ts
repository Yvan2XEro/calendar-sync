import { beforeEach, describe, expect, it, mock } from "bun:test";

import {
	calendarConnection,
	event,
	eventCalendarSync,
	organizationProvider,
	provider,
} from "@/db/schema/app";

type EventRow = {
	id: string;
	title: string;
	description: string | null;
	location: string | null;
	slug: string;
	startAt: Date;
	endAt: Date | null;
	isAllDay: boolean;
	isPublished: boolean;
	status: (typeof event.status.enumValues)[number];
	metadata: Record<string, unknown> | null;
	organizationId: string | null;
};

type SyncRecord = {
	id: number;
	eventId: string;
	memberId: string | null;
	googleEventId: string | null;
	status: (typeof eventCalendarSync.status.enumValues)[number];
	lastSyncedAt: Date | null;
	failureReason: string | null;
};

type MockFunction<T extends (...args: any[]) => any> = ((
	...args: Parameters<T>
) => ReturnType<T>) & {
	calls: Array<Parameters<T>>;
	implementation: T;
	mockImplementation: (impl: T) => void;
	mockReset: () => void;
};

function createMockFn<T extends (...args: any[]) => any>(
	impl: T,
): MockFunction<T> {
	const wrapper = ((...args: Parameters<T>) => {
		wrapper.calls.push(args);
		return wrapper.implementation(...args);
	}) as MockFunction<T>;
	const initial = impl;
	wrapper.calls = [];
	wrapper.implementation = impl;
	wrapper.mockImplementation = (next: T) => {
		wrapper.implementation = next;
	};
	wrapper.mockReset = () => {
		wrapper.calls = [];
		wrapper.implementation = initial;
	};
	return wrapper;
}

class FakeSelectBuilder {
	private table: unknown;

	constructor(private readonly db: FakeDb) {}

	from(table: unknown) {
		this.table = table;
		return this;
	}

	innerJoin() {
		return this;
	}

	where() {
		return this;
	}

	orderBy() {
		return this;
	}

	limit() {
		if (this.table === event) {
			return Promise.resolve([this.db.projectEvent()] satisfies Array<
				Record<string, unknown>
			>);
		}

		if (this.table === eventCalendarSync) {
			const record = this.db.getSyncRecord();
			return Promise.resolve(record ? [record] : []);
		}

		if (this.table === organizationProvider || this.table === provider) {
			return Promise.resolve([] as Record<string, unknown>[]);
		}

		if (this.table === calendarConnection) {
			return Promise.resolve([] as Record<string, unknown>[]);
		}

		return Promise.resolve([] as Record<string, unknown>[]);
	}
}

class FakeInsertBuilder {
	constructor(private readonly db: FakeDb) {}

	values(
		values: Partial<SyncRecord> & { eventId: string; memberId?: string | null },
	) {
		this.db.insertSyncRecord(values);
		return this;
	}

	onConflictDoNothing() {
		return this;
	}
}

class FakeUpdateBuilder {
	constructor(private readonly db: FakeDb) {}

	set(updates: Partial<SyncRecord>) {
		this.db.updateSyncRecord(updates);
		return this;
	}

	where() {
		return this;
	}
}

class FakeDb {
	private syncRecords = new Map<string, SyncRecord>();
	private sequence = 1;
	currentMemberId: string | null = null;

	constructor(private readonly eventRow: EventRow) {}

	reset() {
		this.syncRecords = new Map();
		this.sequence = 1;
		this.currentMemberId = null;
	}

	select() {
		return new FakeSelectBuilder(this);
	}

	insert(table: unknown) {
		if (table !== eventCalendarSync) {
			throw new Error("Unsupported insert table");
		}
		return new FakeInsertBuilder(this);
	}

	update(table: unknown) {
		if (table !== eventCalendarSync) {
			throw new Error("Unsupported update table");
		}
		return new FakeUpdateBuilder(this);
	}

	projectEvent() {
		return { ...this.eventRow } satisfies Record<string, unknown>;
	}

	private key(memberId: string | null) {
		return memberId ?? "__organization__";
	}

	getSyncRecord(memberId = this.currentMemberId ?? null) {
		return this.syncRecords.get(this.key(memberId)) ?? null;
	}

	insertSyncRecord(
		values: Partial<SyncRecord> & { eventId: string; memberId?: string | null },
	) {
		const memberId = values.memberId ?? this.currentMemberId ?? null;
		const key = this.key(memberId);
		if (this.syncRecords.has(key)) {
			return;
		}
		this.syncRecords.set(key, {
			id: this.sequence++,
			eventId: values.eventId,
			memberId,
			googleEventId: values.googleEventId ?? null,
			status: (values.status as SyncRecord["status"]) ?? "pending",
			lastSyncedAt: values.lastSyncedAt ?? null,
			failureReason: values.failureReason ?? null,
		});
	}

	updateSyncRecord(updates: Partial<SyncRecord>) {
		const key = this.key(this.currentMemberId ?? null);
		const record = this.syncRecords.get(key);
		if (!record) return;
		if (Object.hasOwn(updates, "googleEventId")) {
			record.googleEventId = updates.googleEventId ?? null;
		}
		if (Object.hasOwn(updates, "status")) {
			record.status = (updates.status as SyncRecord["status"]) ?? "pending";
		}
		if (Object.hasOwn(updates, "lastSyncedAt")) {
			record.lastSyncedAt = updates.lastSyncedAt ?? null;
		}
		if (Object.hasOwn(updates, "failureReason")) {
			record.failureReason = updates.failureReason ?? null;
		}
	}
}

let currentDb: FakeDb;

const dbProxy = new Proxy(
	{},
	{
		get(_target, key) {
			const value = (currentDb as never)[key as keyof FakeDb];
			if (typeof value === "function") {
				return value.bind(currentDb);
			}
			return value;
		},
	},
);

const calendarConnectionsMock = {
	resolveGoogleCalendarConnection: createMockFn(
		async (_organizationId: string, _memberId?: string) => null,
	),
	markConnectionStatus: createMockFn(async () => {}),
	updateConnectionCredentials: createMockFn(async () => {}),
	touchConnectionSynced: createMockFn(async () => {}),
	clearConnectionCredentials: createMockFn(async () => {}),
};

const integrationsMock = {
	deleteGoogleCalendarEvent: createMockFn(async () => {}),
	upsertGoogleCalendarEvent: createMockFn(
		async (_input: { calendarId: string; existingEventId?: string | null }) =>
			"mock-event",
	),
	getOAuthCalendarClient: createMockFn(async () => ({
		client: {} as unknown,
		refreshedCredentials: null,
	})),
	isGoogleCalendarConfigured: () => true,
};

const googleClientMock = {
	getCalendarClientForUser: createMockFn(async () => ({ calendar: {} })),
};

mock.module("@/db", () => ({ db: dbProxy }));
mock.module("@/lib/calendar-connections", () => calendarConnectionsMock);
mock.module("@/lib/integrations/google-calendar", () => integrationsMock);
mock.module("@/lib/google-calendar", () => googleClientMock);
mock.module("@/lib/site-metadata", () => ({
	buildAbsoluteUrl: (path: string) => `https://example.com${path}`,
}));

const calendarSyncModulePromise = import("./calendar-sync");

const baseEvent: EventRow = {
	id: "evt-1",
	title: "Board meeting",
	description: null,
	location: null,
	slug: "board-meeting",
	startAt: new Date("2024-01-01T10:00:00Z"),
	endAt: new Date("2024-01-01T11:00:00Z"),
	isAllDay: false,
	isPublished: true,
	status: "approved",
	metadata: null,
	organizationId: "org-1",
};

beforeEach(() => {
	currentDb = new FakeDb(baseEvent);
	currentDb.reset();
	calendarConnectionsMock.resolveGoogleCalendarConnection.mockReset();
	calendarConnectionsMock.markConnectionStatus.mockReset();
	calendarConnectionsMock.updateConnectionCredentials.mockReset();
	calendarConnectionsMock.touchConnectionSynced.mockReset();
	calendarConnectionsMock.clearConnectionCredentials.mockReset();
	integrationsMock.deleteGoogleCalendarEvent.mockReset();
	integrationsMock.upsertGoogleCalendarEvent.mockReset();
	integrationsMock.getOAuthCalendarClient.mockReset();
	googleClientMock.getCalendarClientForUser.mockReset();
});

async function loadModule() {
	return calendarSyncModulePromise;
}

describe("syncEventWithGoogleCalendar", () => {
	it("falls back to personal calendar when no organization connection is linked", async () => {
		const { syncEventWithGoogleCalendar } = await loadModule();

		integrationsMock.upsertGoogleCalendarEvent.mockImplementation(
			async () => "personal-evt-1",
		);

		currentDb.currentMemberId = "member-1";

		const result = await syncEventWithGoogleCalendar(baseEvent.id, {
			memberId: "member-1",
			userId: "user-1",
		});

		expect(result).toBe("created");
		expect(googleClientMock.getCalendarClientForUser.calls.at(0)).toEqual([
			"user-1",
		]);
		const syncRecord = currentDb.getSyncRecord("member-1");
		expect(syncRecord?.googleEventId).toBe("personal-evt-1");
		expect(syncRecord?.status).toBe("synced");
	});

	it("passes the canonical event detail URL to Google", async () => {
		const { syncEventWithGoogleCalendar } = await loadModule();

		currentDb.currentMemberId = "member-1";

		await syncEventWithGoogleCalendar(baseEvent.id, {
			memberId: "member-1",
			userId: "user-1",
		});

		const call = integrationsMock.upsertGoogleCalendarEvent.calls.at(0);
		expect(call?.[0].event.url).toBe(
			"https://example.com/events/board-meeting",
		);
	});

	it("stores distinct Google event identifiers per member when organization connections are present", async () => {
		const { syncEventWithGoogleCalendar } = await loadModule();

		const connections = new Map(
			["member-1", "member-2"].map((id) => [
				id,
				{
					id: `conn-${id}`,
					memberId: id,
					calendarId: `calendar-${id}`,
					accessToken: `token-${id}`,
					refreshToken: null,
					scope: null,
					tokenExpiresAt: null,
				} as const,
			]),
		);

		calendarConnectionsMock.resolveGoogleCalendarConnection.mockImplementation(
			async (_orgId, memberId) =>
				memberId ? (connections.get(memberId) ?? null) : null,
		);

		const scheduledIds = ["org-evt-member-1", "org-evt-member-2"];
		integrationsMock.upsertGoogleCalendarEvent.mockImplementation(
			async () => scheduledIds.shift() ?? "unexpected",
		);

		currentDb.currentMemberId = "member-1";
		const firstResult = await syncEventWithGoogleCalendar(baseEvent.id, {
			memberId: "member-1",
		});

		currentDb.currentMemberId = "member-2";
		const secondResult = await syncEventWithGoogleCalendar(baseEvent.id, {
			memberId: "member-2",
		});

		expect(firstResult).toBe("created");
		expect(secondResult).toBe("created");
		expect(calendarConnectionsMock.touchConnectionSynced.calls.length).toBe(2);
		expect(currentDb.getSyncRecord("member-1")?.googleEventId).toBe(
			"org-evt-member-1",
		);
		expect(currentDb.getSyncRecord("member-2")?.googleEventId).toBe(
			"org-evt-member-2",
		);
	});
});
