"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";

import { providerKeys } from "@/lib/query-keys/providers";
import { trpcClient } from "@/lib/trpc-client";
import type { AppRouter } from "@/routers";

type ProvidersRouterInputs = inferRouterInputs<AppRouter>["providers"];
type ProvidersRouterOutputs = inferRouterOutputs<AppRouter>["providers"];

type OrgListResponse = ProvidersRouterOutputs["org"]["list"];

type LinkVariables = Omit<ProvidersRouterInputs["org"]["link"], "slug">;
type LinkResponse = ProvidersRouterOutputs["org"]["link"];

export function useOrgProviderList(slug: string) {
        return useQuery<OrgListResponse>({
                queryKey: providerKeys.orgList(slug),
                queryFn: () => trpcClient.providers.org.list.query({ slug }),
                enabled: Boolean(slug),
        });
}

export function useLinkOrgProviders(slug: string) {
        const queryClient = useQueryClient();

        return useMutation<LinkResponse, Error, LinkVariables>({
                mutationFn: (variables) =>
                        trpcClient.providers.org.link.mutate({ slug, ...variables }),
                onSuccess: async () => {
                        toast.success("Updated provider availability");

                        await Promise.all([
                                queryClient.invalidateQueries({ queryKey: providerKeys.orgRoot(slug) }),
                                queryClient.invalidateQueries({ queryKey: providerKeys.listRoot(slug) }),
                        ]);
                },
                onError: (error) => {
                        toast.error(error.message ?? "Unable to update providers");
                },
        });
}
