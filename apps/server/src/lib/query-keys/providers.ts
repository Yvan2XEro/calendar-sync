export const providerKeys = {
        all: ["providers"] as const,
        orgRoot: (slug: string) => [...providerKeys.all, "org", slug] as const,
        orgList: (slug: string) => [...providerKeys.orgRoot(slug), "list"] as const,
        listRoot: (slug: string) => [...providerKeys.all, slug, "list"] as const,
	list: (
		slug: string,
		params?: {
			query?: string | null;
			status?: string | null;
			providerStatus?: string | null;
			limit?: number | null;
			offset?: number | null;
		},
	) =>
		[
			...providerKeys.listRoot(slug),
			params?.query ?? null,
			params?.status ?? null,
			params?.providerStatus ?? null,
			params?.limit ?? null,
			params?.offset ?? null,
		] as const,
	detail: (slug: string, providerId: string) =>
		[...providerKeys.all, slug, "detail", providerId] as const,
};
