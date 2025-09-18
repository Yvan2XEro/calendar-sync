"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpcClient } from "@/lib/trpc-client";

const PROVIDERS_QUERY_KEY = ["providers", "catalog"] as const;

type ProviderOption = {
  id: string;
  name: string;
  description?: string | null;
};

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

export type CalendarProvidersCardProps = {
  slug: string;
};

export function CalendarProvidersCard({ slug }: CalendarProvidersCardProps) {
  const providersQuery = useQuery({
    queryKey: [...PROVIDERS_QUERY_KEY, slug],
    queryFn: async () => {
      const response = await trpcClient.providers.list.query();
      const list = Array.isArray(response) ? response : [];

      return list
        .map((option) => normaliseProvider(option))
        .filter((option): option is ProviderOption => Boolean(option));
    },
  });

  const options = providersQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar providers</CardTitle>
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
        ) : providersQuery.isLoading ? (
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
              Configure providers from the organization settings to make them
              available here.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {options.map((option) => (
              <div
                key={option.id}
                className="rounded-lg border border-border p-3"
              >
                <p className="font-medium text-sm text-foreground">
                  {option.name}
                </p>
                {option.description ? (
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
