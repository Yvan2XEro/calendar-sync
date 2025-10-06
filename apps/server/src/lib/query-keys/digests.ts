export const digestKeys = {
	all: ["adminDigests"] as const,
	schedules: () => [...digestKeys.all, "schedules"] as const,
} as const;
