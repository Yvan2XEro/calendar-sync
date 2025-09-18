"use client";

import {
  RedirectToSignIn,
  UserAvatar,
  useCurrentOrganization,
} from "@daveyplate/better-auth-ui";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

import AppShell from "@/components/layout/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderConnection, useProviderDetail } from "@/hooks/use-provider-admin";

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const providerIdParam = params?.providerId;
  const providerId = Array.isArray(providerIdParam)
    ? providerIdParam[0]
    : (providerIdParam ?? "");

  const { data: organization } = useCurrentOrganization();
  const slug = useMemo(() => organization?.slug ?? "", [organization?.slug]);

  const detailQuery = useProviderDetail(slug, providerId);
  const connectionMutation = useProviderConnection(slug);

  const detail = detailQuery.data;
  const isLoading = detailQuery.isLoading;
  const isConnected = detail?.isConnected ?? false;

  const statusBadge = detail?.provider.status ? (
    <Badge variant={detail.provider.status === "active" ? "default" : "secondary"}>
      {detail.provider.status.charAt(0).toUpperCase() +
        detail.provider.status.slice(1)}
    </Badge>
  ) : null;

  const handleToggleConnection = () => {
    connectionMutation.mutate({
      providerId,
      connect: !isConnected,
    });
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: "Admin", href: "/admin/overview" },
        { label: "Providers", href: "/admin/providers" },
        detail?.provider
          ? { label: detail.provider.name, current: true }
          : { label: "Provider", current: true },
      ]}
      headerRight={<UserAvatar />}
    >
      <RedirectToSignIn />
      <div className="space-y-6">
        <Button variant="ghost" className="-ml-2" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>
              {isLoading ? <Skeleton className="h-6 w-48" /> : detail?.provider.name}
            </CardTitle>
            <CardDescription>
              {isLoading ? (
                <Skeleton className="h-4 w-72" />
              ) : detail?.provider.description ? (
                detail.provider.description
              ) : (
                "No description available."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!slug ? (
              <Alert>
                <AlertTitle>Select an organization</AlertTitle>
                <AlertDescription>
                  Choose an organization to manage provider connections.
                </AlertDescription>
              </Alert>
            ) : detailQuery.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to load provider</AlertTitle>
                <AlertDescription>
                  {(detailQuery.error as Error)?.message ??
                    "Something went wrong while fetching the provider."}
                </AlertDescription>
              </Alert>
            ) : isLoading || !detail ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-36" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">{detail.provider.category}</Badge>
                  {statusBadge}
                </div>
                <p className="text-muted-foreground text-sm">
                  Provider ID: {detail.provider.id}
                </p>
                <p className="text-muted-foreground text-sm">
                  Connection status: {isConnected ? "Connected" : "Not connected"}
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="outline" onClick={() => router.push("/admin/providers")}>
              Back to providers
            </Button>
            <Button
              disabled={!slug || connectionMutation.isPending || !providerId}
              variant={isConnected ? "outline" : "default"}
              onClick={handleToggleConnection}
            >
              {isConnected ? "Disconnect" : "Connect"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}
