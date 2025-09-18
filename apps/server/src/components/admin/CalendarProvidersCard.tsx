"use client";

import * as React from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
        Card,
        CardContent,
        CardDescription,
        CardHeader,
        CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useLinkOrgProviders, useOrgProviderList } from "@/hooks/use-provider-admin";

type ProviderOption = {
        id: string;
        name: string;
        description: string | null;
        linked: boolean;
};

export type CalendarProvidersCardProps = {
        slug: string;
};

export function CalendarProvidersCard({ slug }: CalendarProvidersCardProps) {
        const providersQuery = useOrgProviderList(slug);
        const linkMutation = useLinkOrgProviders(slug);

        const items: ProviderOption[] = providersQuery.data?.items ?? [];

        const initialSelection = React.useMemo(
                () => items.filter((item) => item.linked).map((item) => item.id),
                [items],
        );

        const [selected, setSelected] = React.useState<string[]>([]);

        React.useEffect(() => {
                setSelected(initialSelection);
        }, [initialSelection]);

        const initialSet = React.useMemo(() => new Set(initialSelection), [initialSelection]);
        const selectedSet = React.useMemo(() => new Set(selected), [selected]);

        const hasChanges = React.useMemo(() => {
                if (initialSet.size !== selectedSet.size) {
                        return true;
                }

                for (const id of selectedSet) {
                        if (!initialSet.has(id)) {
                                return true;
                        }
                }

                return false;
        }, [initialSet, selectedSet]);

        const toggleSelection = React.useCallback(
                (id: string, checked: CheckedState) => {
                        if (linkMutation.isPending) {
                                return;
                        }

                        setSelected((previous) => {
                                const next = new Set(previous);

                                if (checked === true) {
                                        next.add(id);
                                } else {
                                        next.delete(id);
                                }

                                return Array.from(next);
                        });
                },
                [linkMutation.isPending],
        );

        const handleSave = React.useCallback(() => {
                if (!hasChanges) {
                        return;
                }

                linkMutation.mutate({ providerIds: selected });
        }, [hasChanges, linkMutation, selected]);

        const handleReset = React.useCallback(() => {
                setSelected(Array.from(initialSet));
        }, [initialSet]);

        return (
                <Card>
                        <CardHeader>
                                <CardTitle>Calendar providers</CardTitle>
                                <CardDescription>
                                        Choose which providers are available to this organization.
                                </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                                {providersQuery.isError ? (
                                        <Alert variant="destructive">
                                                <AlertCircle className="mt-0.5" />
                                                <AlertTitle>Unable to load providers</AlertTitle>
                                                <AlertDescription>
                                                        {providersQuery.error instanceof Error
                                                                ? providersQuery.error.message
                                                                : "Something went wrong while fetching providers."}
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
                                ) : items.length === 0 ? (
                                        <Alert>
                                                <AlertTitle>No providers available</AlertTitle>
                                                <AlertDescription>
                                                        Configure providers from the organization settings to make them
                                                        available here.
                                                </AlertDescription>
                                        </Alert>
                                ) : (
                                        <>
                                                <div className="space-y-3">
                                                        {items.map((item) => {
                                                                const inputId = `provider-${item.id}`;

                                                                return (
                                                                        <label
                                                                                key={item.id}
                                                                                htmlFor={inputId}
                                                                                className="flex items-start gap-3 rounded-lg border border-border p-3"
                                                                        >
                                                                                <Checkbox
                                                                                        id={inputId}
                                                                                        checked={selectedSet.has(item.id)}
                                                                                        onCheckedChange={(checked) =>
                                                                                                toggleSelection(item.id, checked)
                                                                                        }
                                                                                        disabled={linkMutation.isPending}
                                                                                />
                                                                                <div className="space-y-1">
                                                                                        <p className="text-sm font-medium text-foreground">
                                                                                                {item.name}
                                                                                        </p>
                                                                                        {item.description ? (
                                                                                                <p className="text-sm text-muted-foreground">
                                                                                                        {item.description}
                                                                                                </p>
                                                                                        ) : null}
                                                                                </div>
                                                                        </label>
                                                                );
                                                        })}
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                        <Button
                                                                variant="outline"
                                                                onClick={handleReset}
                                                                disabled={!hasChanges || linkMutation.isPending}
                                                        >
                                                                Discard changes
                                                        </Button>
                                                        <Button
                                                                onClick={handleSave}
                                                                disabled={!hasChanges || linkMutation.isPending}
                                                                aria-busy={linkMutation.isPending}
                                                        >
                                                                Save changes
                                                        </Button>
                                                </div>
                                        </>
                                )}
                        </CardContent>
                </Card>
        );
}
