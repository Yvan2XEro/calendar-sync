"use client";

import {
  RedirectToSignIn,
  UserAvatar,
  useCurrentOrganization,
} from "@daveyplate/better-auth-ui";
import { useMemo } from "react";

import AppShell from "@/components/layout/AppShell";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProviderList, useProviderConnection } from "@/hooks/use-provider-admin";

export default function ProvidersAdminPage() {
  const { data: organization } = useCurrentOrganization();
  const slug = useMemo(() => organization?.slug ?? "", [organization?.slug]);

  const providersQuery = useProviderList(slug, { limit: 100 });
  const connectionMutation = useProviderConnection(slug);

  const rows = providersQuery.data?.items ?? [];

  const renderStatusBadge = (status?: string | null) => {
    if (!status) {
      return <Badge variant="secondary">Unknown</Badge>;
    }

    const normalized = status as string;
    const variant = normalized === "active" ? "default" : "secondary";
    const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);

    return <Badge variant={variant}>{label}</Badge>;
  };

  const handleToggleConnection = (providerId: string, isConnected: boolean) => {
    connectionMutation.mutate({
      providerId,
      connect: !isConnected,
    });
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: "Admin", href: "/admin/overview" },
        { label: "Providers", current: true },
      ]}
      headerRight={<UserAvatar />}
    >
      <RedirectToSignIn />
      <Card>
        <CardHeader>
          <CardTitle>Provider catalog</CardTitle>
          <CardDescription>
            Connect providers to your organization so the team can use them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!slug ? (
            <Alert>
              <AlertTitle>Select an organization</AlertTitle>
              <AlertDescription>
                Choose an organization to manage the available providers.
              </AlertDescription>
            </Alert>
          ) : providersQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load providers</AlertTitle>
              <AlertDescription>
                {(providersQuery.error as Error)?.message ??
                  "Something went wrong while fetching providers."}
              </AlertDescription>
            </Alert>
          ) : providersQuery.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-60" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Alert>
              <AlertTitle>No providers found</AlertTitle>
              <AlertDescription>
                Configure providers to make them available to your organization.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Connection</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isMutating =
                    connectionMutation.isPending &&
                    connectionMutation.variables?.providerId === row.id;
                  const actionLabel = row.isConnected ? "Disconnect" : "Connect";

                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-foreground text-sm">
                            {row.name}
                          </span>
                          {row.description ? (
                            <span className="text-muted-foreground text-xs">
                              {row.description}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.category}
                      </TableCell>
                      <TableCell>{renderStatusBadge(row.providerStatus)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={row.isConnected ? "outline" : "default"}
                          size="sm"
                          disabled={isMutating}
                          onClick={() => handleToggleConnection(row.id, row.isConnected)}
                        >
                          {actionLabel}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
