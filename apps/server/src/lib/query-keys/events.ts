const serialize = (value: unknown) => JSON.stringify(value);

export const eventKeys = {
	all: ["events"] as const,
	recentForUser: (params?: { limit?: number }) =>
		[...eventKeys.all, "recentForUser", params?.limit ?? null] as const,
	attendees: {
		root: (eventId: string) =>
			[...eventKeys.all, "attendees", eventId] as const,
		list: (eventId: string, params: Record<string, unknown>) =>
			[
				...eventKeys.attendees.root(eventId),
				"list",
				serialize(params),
			] as const,
	},
	analytics: {
		root: (eventId: string) =>
			[...eventKeys.all, "analytics", eventId] as const,
		overview: (eventId: string) =>
			[...eventKeys.analytics.root(eventId), "overview"] as const,
		timeseries: (eventId: string, params: Record<string, unknown>) =>
			[
				...eventKeys.analytics.root(eventId),
				"timeseries",
				serialize(params),
			] as const,
	},
};
