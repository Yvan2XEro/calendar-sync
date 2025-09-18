"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { providerKeys } from "@/lib/query-keys/providers";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

type ProvidersRouterInputs = inferRouterInputs<AppRouter>["providers"];
type ProvidersRouterOutputs = inferRouterOutputs<AppRouter>["providers"];

type ListParams = Omit<ProvidersRouterInputs["list"], "slug">;
type ListResponse = ProvidersRouterOutputs["list"];

type ProviderDetailResponse = ProvidersRouterOutputs["get"];

type SaveVariables = Omit<ProvidersRouterInputs["save"], "slug">;
type SaveResponse = ProvidersRouterOutputs["save"];

type TestVariables = Omit<ProvidersRouterInputs["test"], "slug">;
type TestResponse = ProvidersRouterOutputs["test"];

export function useProviderList(slug: string, params?: ListParams) {
	return useQuery<ListResponse>({
		queryKey: providerKeys.list(slug, params),
		queryFn: () => trpcClient.providers.list.query({ slug, ...(params ?? {}) }),
		enabled: Boolean(slug),
	});
}

export function useProviderDraft(slug: string, providerId: string) {
	return useQuery<ProviderDetailResponse>({
		queryKey: providerKeys.detail(slug, providerId),
		queryFn: () => trpcClient.providers.get.query({ slug, providerId }),
		enabled: Boolean(slug && providerId),
	});
}

export function useSaveProvider(slug: string) {
	const queryClient = useQueryClient();

	return useMutation<SaveResponse, Error, SaveVariables>({
		mutationFn: (variables) =>
			trpcClient.providers.save.mutate({ slug, ...variables }),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: providerKeys.listRoot(slug) });

			if (result?.providerId) {
				queryClient.invalidateQueries({
					queryKey: providerKeys.detail(slug, result.providerId),
				});
			}
		},
	});
}

export function useTestProvider(slug: string) {
	const queryClient = useQueryClient();

	return useMutation<TestResponse, Error, TestVariables>({
		mutationFn: (variables) =>
			trpcClient.providers.test.mutate({ slug, ...variables }),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: providerKeys.listRoot(slug) });

			if (result?.providerId) {
				queryClient.invalidateQueries({
					queryKey: providerKeys.detail(slug, result.providerId),
				});
			}
		},
	});
}
