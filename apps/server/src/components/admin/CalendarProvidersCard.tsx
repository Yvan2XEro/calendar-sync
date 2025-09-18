"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, trpcClient } from "@/lib/trpc-client";

const PROVIDERS_QUERY_KEY = ["providers", "all"] as const;
const linkedProvidersKey = (slug: string) =>
	["providers", "linked", slug] as const;

type ProviderOption = {
	id: string;
	name: string;
	description?: string | null;
};

type ProvidersClient = typeof trpcClient & {
	providers: {
		listAll: {
			query: () => Promise<unknown>;
		};
		listLinkedBySlug: {
			query: (input: { slug: string }) => Promise<unknown>;
		};
		saveLinks: {
			mutate: (input: {
				slug: string;
				providerIds: string[];
			}) => Promise<unknown>;
		};
	};
};

const providersClient = trpcClient as ProvidersClient;

function normaliseProvider(option: unknown): ProviderOption | null {
	if (typeof option === "string") {
		return { id: option, name: option };
	}

	if (!option || typeof option !== "object") {
		return null;
	}

	const record = option as Record<string, unknown>;
	const rawId = record.id ?? record.providerId ?? record.slug;
	const id = typeof rawId === "string" ? rawId : rawId ? String(rawId) : null;

	if (!id) {
		return null;
	}

	const nameSource =
		record.name ?? record.label ?? record.title ?? record.providerName ?? id;
	const name =
		typeof nameSource === "string" ? nameSource : String(nameSource ?? id);

	const descriptionSource =
		record.description ?? record.summary ?? record.details ?? null;

	return {
		id,
		name,
		description:
			typeof descriptionSource === "string" ? descriptionSource : null,
	};
}

function extractLinkedProviderIds(value: unknown): string[] {
	if (!value) {
		return [];
	}

	const normaliseArray = (entries: unknown[]): string[] =>
		entries
			.map((entry) => {
				if (typeof entry === "string") {
					return entry;
				}

				if (entry && typeof entry === "object") {
					const record = entry as Record<string, unknown>;
					const rawId = record.id ?? record.providerId ?? record.slug;
					if (typeof rawId === "string") {
						return rawId;
					}
					if (rawId) {
						return String(rawId);
					}
				}

				return null;
			})
			.filter((id): id is string => Boolean(id));

	if (Array.isArray(value)) {
		return normaliseArray(value);
	}

	if (typeof value === "string") {
		return [value];
	}

	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;

		if (Array.isArray(record.providerIds)) {
			return normaliseArray(record.providerIds);
		}

		if (Array.isArray(record.ids)) {
			return normaliseArray(record.ids);
		}

		const rawId = record.id ?? record.providerId ?? record.slug;
		if (typeof rawId === "string") {
			return [rawId];
		}
		if (rawId) {
			return [String(rawId)];
		}
	}

	return [];
}

function arraysAreEqual(a: string[], b: string[]) {
	if (a.length !== b.length) {
		return false;
	}

	const sortedA = [...a].sort();
	const sortedB = [...b].sort();

	return sortedA.every((value, index) => value === sortedB[index]);
}

export type CalendarProvidersCardProps = {
	slug: string;
};

export function CalendarProvidersCard({ slug }: CalendarProvidersCardProps) {
	const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
	const [savedProviders, setSavedProviders] = useState<string[]>([]);

	const providersQuery = useQuery({
		queryKey: PROVIDERS_QUERY_KEY,
		queryFn: async () => {
			const response = await providersClient.providers.listAll.query();
			const maybeList = Array.isArray(response)
				? response
				: response && typeof response === "object"
					? (response as Record<string, unknown>).items
					: [];
			const list = Array.isArray(maybeList) ? maybeList : [];

			const parsed = list
				.map((option) => normaliseProvider(option))
				.filter((option): option is ProviderOption => Boolean(option));

			return parsed;
		},
	});

	const linkedProvidersQuery = useQuery({
		queryKey: linkedProvidersKey(slug),
		queryFn: async () => {
			const response = await providersClient.providers.listLinkedBySlug.query({
				slug,
			});

			return extractLinkedProviderIds(response);
		},
	});

	useEffect(() => {
		if (linkedProvidersQuery.status === "success") {
			setSelectedProviders(linkedProvidersQuery.data ?? []);
			setSavedProviders(linkedProvidersQuery.data ?? []);
		}
	}, [linkedProvidersQuery.data, linkedProvidersQuery.status]);

	const mutation = useMutation<
		unknown,
		unknown,
		string[],
		{ previousProviders?: string[] }
	>({
		mutationFn: async (providerIds: string[]) => {
			await providersClient.providers.saveLinks.mutate({
				slug,
				providerIds,
			});
		},
		onMutate: async (nextProviders) => {
			await queryClient.cancelQueries({
				queryKey: linkedProvidersKey(slug),
			});

			const previousProviders = queryClient.getQueryData<string[]>(
				linkedProvidersKey(slug),
			);

			setSavedProviders(nextProviders);
			queryClient.setQueryData(linkedProvidersKey(slug), nextProviders);

			return { previousProviders };
		},
		onError: (error, _variables, context) => {
			setSavedProviders((current) => context?.previousProviders ?? current);
			setSelectedProviders((current) => context?.previousProviders ?? current);
			if (context?.previousProviders) {
				queryClient.setQueryData(
					linkedProvidersKey(slug),
					context.previousProviders,
				);
			}

			const message =
				error instanceof Error
					? error.message
					: "Unable to save calendar provider changes.";
			toast.error(message);
		},
		onSuccess: (_data, variables) => {
			setSavedProviders(variables);
			toast.success("Calendar providers updated.");
			queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
			queryClient.invalidateQueries({
				queryKey: linkedProvidersKey(slug),
			});
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: linkedProvidersKey(slug),
			});
		},
	});

	const options = providersQuery.data ?? [];

	const isDirty = useMemo(
		() => !arraysAreEqual(selectedProviders, savedProviders),
		[selectedProviders, savedProviders],
	);

	const isLoading = providersQuery.isLoading || linkedProvidersQuery.isLoading;

	const handleToggle = (id: string, nextChecked: boolean) => {
		setSelectedProviders((current) => {
			if (nextChecked) {
				if (current.includes(id)) {
					return current;
				}

				return [...current, id];
			}

			return current.filter((providerId) => providerId !== id);
		});
	};

	const handleReset = () => {
		setSelectedProviders(savedProviders);
	};

	const handleSubmit = () => {
		mutation.mutate(selectedProviders);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Calendar providers</CardTitle>
				<CardDescription>
					Choose which integrations are available to this calendar. Changes are
					saved immediately when you click save.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				{providersQuery.isError ? (
					<Alert variant="destructive">
						<AlertCircle className="mt-0.5" />
						<AlertTitle>Unable to load providers</AlertTitle>
						<AlertDescription>
							{(providersQuery.error as Error)?.message ??
								"Something went wrong while fetching providers."}
						</AlertDescription>
					</Alert>
				) : linkedProvidersQuery.isError ? (
					<Alert variant="destructive">
						<AlertCircle className="mt-0.5" />
						<AlertTitle>Unable to load linked providers</AlertTitle>
						<AlertDescription>
							{(linkedProvidersQuery.error as Error)?.message ??
								"Something went wrong while fetching linked providers."}
						</AlertDescription>
					</Alert>
				) : isLoading ? (
					<div className="space-y-3">
						{[0, 1, 2].map((item) => (
							<div key={item} className="flex items-center gap-3">
								<Skeleton className="size-4 rounded" />
								<div className="flex-1 space-y-1">
									<Skeleton className="h-3 w-32" />
									<Skeleton className="h-3 w-48" />
								</div>
							</div>
						))}
					</div>
				) : options.length === 0 ? (
					<Alert>
						<AlertTitle>No providers available</AlertTitle>
						<AlertDescription>
							Add calendar providers in the workspace settings to link them
							here.
						</AlertDescription>
					</Alert>
				) : (
					<fieldset className="space-y-3">
						<legend className="sr-only">Calendar providers</legend>
						{options.map((option) => (
							<label
								key={option.id}
								htmlFor={`provider-${option.id}`}
								className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-3 transition focus-within:border-primary hover:border-border"
							>
								<Checkbox
									id={`provider-${option.id}`}
									checked={selectedProviders.includes(option.id)}
									onCheckedChange={(checked) =>
										handleToggle(option.id, checked === true)
									}
									aria-describedby={
										option.description
											? `provider-${option.id}-description`
											: undefined
									}
								/>
								<span className="grid gap-1">
									<span className="font-medium text-foreground text-sm leading-none">
										{option.name}
									</span>
									{option.description ? (
										<span
											id={`provider-${option.id}-description`}
											className="text-muted-foreground text-sm"
										>
											{option.description}
										</span>
									) : null}
								</span>
							</label>
						))}
					</fieldset>
				)}
			</CardContent>
			<CardFooter className="flex flex-wrap items-center justify-end gap-3">
				<Button
					type="button"
					variant="outline"
					onClick={handleReset}
					disabled={!isDirty || mutation.isPending}
				>
					Reset
				</Button>
				<Button
					type="button"
					onClick={handleSubmit}
					disabled={!isDirty || mutation.isPending}
				>
					{mutation.isPending ? (
						<span className="flex items-center gap-2">
							<Loader2 className="size-4 animate-spin" />
							Saving
						</span>
					) : (
						"Save changes"
					)}
				</Button>
			</CardFooter>
		</Card>
	);
}
