export const orgsKeys = {
        all: ["orgs"] as const,
        joined: (filters?: { search?: string | null; limit?: number }) =>
                [...orgsKeys.all, "joined", filters?.search ?? null, filters?.limit ?? null] as const,
        discover: (filters?: { search?: string | null; limit?: number }) =>
                [...orgsKeys.all, "discover", filters?.search ?? null, filters?.limit ?? null] as const,
};
