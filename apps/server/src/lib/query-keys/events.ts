export const eventKeys = {
        all: ["events"] as const,
        recentForUser: (params?: { limit?: number }) =>
                [...eventKeys.all, "recentForUser", params?.limit ?? null] as const,
};
