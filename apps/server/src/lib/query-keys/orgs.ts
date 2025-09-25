export type OrgListKeyParams = {
        segment: "joined" | "discover";
        search?: string | null;
        limit?: number | null;
        sort?: string | null;
};

export const orgsKeys = {
        all: ["orgs"] as const,
        list: (params: OrgListKeyParams) =>
                [
                        ...orgsKeys.all,
                        "listForUser",
                        params.segment,
                        params.search ?? null,
                        params.limit ?? null,
                        params.sort ?? null,
                ] as const,
};
