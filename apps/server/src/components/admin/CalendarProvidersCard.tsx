"use client";

import * as React from "react";
import { ChevronsUpDown, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLinkOrgProviders, useOrgProviderList } from "@/hooks/use-provider-admin";

type ProviderSummary = {
  id: string;
  name: string;
  category: string;
  status: string;
  lastTestedAt: Date | string | null;
};

type MultiSelectOption = ProviderSummary & { description?: string | null };

type MultiSelectProps = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (nextValue: string[]) => void;
  disabled?: boolean;
};

function MultiSelect({ options, value, onChange, disabled }: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const optionMap = React.useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const selectedSet = React.useMemo(() => new Set(value), [value]);

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((option) => {
      return (
        option.name.toLowerCase().includes(lower) ||
        option.category.toLowerCase().includes(lower) ||
        (option.description ?? "").toLowerCase().includes(lower)
      );
    });
  }, [options, search]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!open) return;
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const toggleValue = React.useCallback(
    (id: string) => {
      const next = new Set(selectedSet);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onChange(Array.from(next));
    },
    [onChange, selectedSet],
  );

  const removeValue = React.useCallback(
    (id: string) => {
      const next = new Set(selectedSet);
      if (next.delete(id)) {
        onChange(Array.from(next));
      }
    },
    [onChange, selectedSet],
  );

  const buttonLabel = React.useMemo(() => {
    if (value.length === 0) {
      return "Select providers";
    }

    if (value.length === 1) {
      const onlyId = value[0];
      const option = optionMap.get(onlyId);
      return option ? option.name : "1 provider selected";
    }

    return `${value.length} providers selected`;
  }, [optionMap, value]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronsUpDown className="ml-2 size-4" aria-hidden="true" />
      </Button>
      {value.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {value.map((id) => {
            const option = optionMap.get(id);
            if (!option) return null;
            return (
              <Badge key={id} variant="secondary" className="flex items-center gap-2">
                <span>{option.name}</span>
                <button
                  type="button"
                  className="-mr-1 rounded-full p-1 hover:bg-muted"
                  onClick={() => removeValue(id)}
                  aria-label={`Remove ${option.name}`}
                  disabled={disabled}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
      {open ? (
        <div className="absolute z-50 mt-2 w-full rounded-md border bg-background shadow-lg">
          <div className="border-b p-2">
            <Input
              autoFocus
              placeholder="Search providers..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search providers"
            />
          </div>
          <div
            role="listbox"
            aria-multiselectable
            className="max-h-64 overflow-auto p-2"
          >
            {filteredOptions.length === 0 ? (
              <p className="p-2 text-center text-sm text-muted-foreground">No providers found</p>
            ) : (
              filteredOptions.map((option) => {
                const inputId = `provider-select-${option.id}`;
                const isChecked = selectedSet.has(option.id);
                return (
                  <label
                    key={option.id}
                    htmlFor={inputId}
                    className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted"
                  >
                    <Checkbox
                      id={inputId}
                      checked={isChecked}
                      onCheckedChange={() => toggleValue(option.id)}
                      disabled={disabled}
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{option.name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{option.category}</span>
                        <span>&middot;</span>
                        <span className="capitalize">{option.status}</span>
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type CalendarProvidersCardProps = {
  slug: string;
};

export function CalendarProvidersCard({ slug }: CalendarProvidersCardProps) {
  const providersQuery = useOrgProviderList(slug);
  const linkMutation = useLinkOrgProviders(slug);

  const options: MultiSelectOption[] = React.useMemo(
    () =>
      providersQuery.data?.catalogSummary.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        status: item.status,
        description: null,
        lastTestedAt: item.lastTestedAt ?? null,
      })) ?? [],
    [providersQuery.data?.catalogSummary],
  );

  const initialSelection = React.useMemo(
    () => providersQuery.data?.linkedProviderIds ?? [],
    [providersQuery.data?.linkedProviderIds],
  );

  const [selected, setSelected] = React.useState<string[]>([]);

  React.useEffect(() => {
    setSelected(initialSelection);
  }, [initialSelection]);

  const hasChanges = React.useMemo(() => {
    const original = new Set(initialSelection);
    const current = new Set(selected);
    if (original.size !== current.size) return true;
    for (const id of current) {
      if (!original.has(id)) return true;
    }
    return false;
  }, [initialSelection, selected]);

  const handleSave = React.useCallback(() => {
    if (!hasChanges) return;
    linkMutation.mutate({ providerIds: selected });
  }, [hasChanges, linkMutation, selected]);

  const handleReset = React.useCallback(() => {
    setSelected(initialSelection);
  }, [initialSelection]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Providers</CardTitle>
        <CardDescription>Link this calendar to one or more providers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {providersQuery.isError ? (
          <Alert variant="destructive">
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
                <Skeleton className="size-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : options.length === 0 ? (
          <Alert>
            <AlertTitle>No providers available</AlertTitle>
            <AlertDescription>
              Configure providers from the global settings to make them available here.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <MultiSelect
              options={options}
              value={selected}
              onChange={setSelected}
              disabled={linkMutation.isPending}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges || linkMutation.isPending}
              >
                Discard changes
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || linkMutation.isPending}
                aria-busy={linkMutation.isPending}
              >
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
