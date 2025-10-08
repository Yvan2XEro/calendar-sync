export const calendarConnectionKeys = {
	all: ["calendarConnections"] as const,
	list: (slug: string | null | undefined) =>
		[...calendarConnectionKeys.all, "list", slug ?? ""] as const,
};

export const adminCalendarConnectionKeys = {
	all: ["adminCalendarConnections"] as const,
	list: (slug: string | null | undefined) =>
		[...adminCalendarConnectionKeys.all, "list", slug ?? ""] as const,
};
