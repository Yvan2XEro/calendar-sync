export type LogFilterParams = {
        providerId?: string | null;
        level?: string | null;
        since?: string | null;
};

export const logsKeys = {
        root: () => ["adminLogs"] as const,
        list: (filters: LogFilterParams) =>
                [...logsKeys.root(), { filters }] as const,
};
