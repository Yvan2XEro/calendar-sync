export const calendarConnectionKeys = {
	all: ["adminCalendarConnections"] as const,
	list: (slug: string | null | undefined) =>
		[...calendarConnectionKeys.all, "list", slug ?? ""] as const,
};
