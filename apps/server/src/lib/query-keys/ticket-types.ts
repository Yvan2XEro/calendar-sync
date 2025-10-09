export const ticketTypeKeys = {
	all: ["adminTicketTypes"] as const,
	list: (params: {
		page: number;
		pageSize: number;
		q?: string;
		status?: string;
		eventId?: string;
	}) => [...ticketTypeKeys.all, "list", params] as const,
};
