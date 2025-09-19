export const providerKeys = {
	all: ["providers"] as const,
	catalog: {
		root: () => [...providerKeys.all, "catalog"] as const,
		list: () => [...providerKeys.catalog.root(), "list"] as const,
		detail: (providerId: string) =>
			[...providerKeys.catalog.root(), "detail", providerId] as const,
	},
	org: {
		root: (slug: string) => [...providerKeys.all, "org", slug] as const,
		list: (slug: string) => [...providerKeys.org.root(slug), "list"] as const,
	},
};
