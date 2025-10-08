export const calendarConnectionKeys = {
	all: ["calendarConnections"] as const,
	list: (slug: string | null | undefined) =>
		[...calendarConnectionKeys.all, "list", slug ?? ""] as const,
};
