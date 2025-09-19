"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";

import { providerKeys } from "@/lib/query-keys/providers";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

type ProvidersRouterInputs = inferRouterInputs<AppRouter>["providers"];
type ProvidersRouterOutputs = inferRouterOutputs<AppRouter>["providers"];

type CatalogListOutput = ProvidersRouterOutputs["catalog"]["list"];
type CatalogGetOutput = ProvidersRouterOutputs["catalog"]["get"];
type CatalogUpsertInput = ProvidersRouterInputs["catalog"]["upsert"];
type CatalogTestInput = ProvidersRouterInputs["catalog"]["testImap"];

type OrgListOutput = ProvidersRouterOutputs["org"]["list"];
type OrgLinkInput = ProvidersRouterInputs["org"]["link"];

type CatalogDeleteInput = ProvidersRouterInputs["catalog"]["delete"];

type CatalogDeleteOutput = ProvidersRouterOutputs["catalog"]["delete"];
type CatalogTestOutput = ProvidersRouterOutputs["catalog"]["testImap"];
type CatalogUpsertOutput = ProvidersRouterOutputs["catalog"]["upsert"];
type OrgLinkOutput = ProvidersRouterOutputs["org"]["link"];

export function useCatalogList() {
	return useQuery<CatalogListOutput>({
		queryKey: providerKeys.catalog.list(),
		queryFn: () => trpcClient.providers.catalog.list.query(),
	});
}

export function useCatalogProvider(providerId: string | undefined) {
	return useQuery<CatalogGetOutput>({
		queryKey: providerId
			? providerKeys.catalog.detail(providerId)
			: providerKeys.catalog.detail("new"),
		queryFn: () =>
			trpcClient.providers.catalog.get.query({ providerId: providerId! }),
		enabled: Boolean(providerId),
	});
}

export function useUpsertCatalogProvider() {
	const queryClient = useQueryClient();

	return useMutation<CatalogUpsertOutput, Error, CatalogUpsertInput>({
		mutationFn: (variables) =>
			trpcClient.providers.catalog.upsert.mutate(variables),
		onSuccess: async (result, variables) => {
			toast.success("Provider saved");

			const tasks: Promise<unknown>[] = [
				queryClient.invalidateQueries({
					queryKey: providerKeys.catalog.list(),
				}),
			];

			if (variables.id) {
				tasks.push(
					queryClient.invalidateQueries({
						queryKey: providerKeys.catalog.detail(variables.id),
					}),
				);
			}

			if (!variables.id && result?.id) {
				tasks.push(
					queryClient.invalidateQueries({
						queryKey: providerKeys.catalog.detail(result.id),
					}),
				);
			}

			await Promise.all(tasks);
		},
		onError: (error) => {
			toast.error(error.message ?? "Unable to save provider");
		},
	});
}

export function useDeleteCatalogProvider() {
	const queryClient = useQueryClient();

	return useMutation<CatalogDeleteOutput, Error, CatalogDeleteInput>({
		mutationFn: (variables) =>
			trpcClient.providers.catalog.delete.mutate(variables),
		onSuccess: async (_, variables) => {
			toast.success("Provider deleted");
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: providerKeys.catalog.list(),
				}),
				queryClient.invalidateQueries({
					queryKey: providerKeys.catalog.detail(variables.providerId),
				}),
			]);
		},
		onError: (error) => {
			toast.error(error.message ?? "Unable to delete provider");
		},
	});
}

export function useTestCatalogImap() {
	return useMutation<CatalogTestOutput, Error, CatalogTestInput>({
		mutationFn: (variables) =>
			trpcClient.providers.catalog.testImap.mutate(variables),
		onSuccess: () => {
			toast.success("IMAP connection successful");
		},
		onError: (error) => {
			toast.error(error.message ?? "IMAP test failed");
		},
	});
}

export function useTestCatalogSmtp() {
	return useMutation<CatalogTestOutput, Error, CatalogTestInput>({
		mutationFn: (variables) =>
			trpcClient.providers.catalog.testSmtp.mutate(variables),
		onSuccess: () => {
			toast.success("SMTP connection successful");
		},
		onError: (error) => {
			toast.error(error.message ?? "SMTP test failed");
		},
	});
}

export function useOrgProviderList(slug: string) {
	return useQuery<OrgListOutput>({
		queryKey: providerKeys.org.list(slug),
		queryFn: () => trpcClient.providers.org.list.query({ slug }),
		enabled: Boolean(slug),
	});
}

export function useLinkOrgProviders(slug: string) {
	const queryClient = useQueryClient();

	return useMutation<OrgLinkOutput, Error, Omit<OrgLinkInput, "slug">>({
		mutationFn: (variables) =>
			trpcClient.providers.org.link.mutate({ slug, ...variables }),
		onSuccess: async () => {
			toast.success("Updated providers for this calendar");
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: providerKeys.org.root(slug),
				}),
				queryClient.invalidateQueries({
					queryKey: providerKeys.catalog.list(),
				}),
			]);
		},
		onError: (error) => {
			toast.error(error.message ?? "Unable to update providers");
		},
	});
}
