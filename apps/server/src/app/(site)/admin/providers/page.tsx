"use client";

import { RedirectToSignIn, UserAvatar } from "@daveyplate/better-auth-ui";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";

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
import {
  useCatalogList,
  useDeleteCatalogProvider,
  useTestCatalogImap,
  useTestCatalogSmtp,
} from "@/hooks/use-provider-admin";

export default function ProvidersAdminPage() {
  const router = useRouter();
  const providersQuery = useCatalogList();
  const imapTestMutation = useTestCatalogImap();
  const smtpTestMutation = useTestCatalogSmtp();
  const deleteMutation = useDeleteCatalogProvider();

  const rows = providersQuery.data ?? [];

  const renderStatusBadge = (status: string) => {
    const normalized = status.toLowerCase();
    const variant = normalized === "active" ? "default" : normalized === "beta" ? "outline" : "secondary";
    return <Badge variant={variant}>{normalized.charAt(0).toUpperCase() + normalized.slice(1)}</Badge>;
  };

  const renderLastTestedAt = (value: Date | string | null | undefined) => {
    if (!value) return "Never";
    const date = value instanceof Date ? value : new Date(value);
    return `${formatDistanceToNow(date, { addSuffix: true })}`;
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
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Provider catalog</CardTitle>
            <CardDescription>Manage global providers for every organization.</CardDescription>
          </div>
          <Button onClick={() => router.push("/admin/providers/new")}>New provider</Button>
        </CardHeader>
        <CardContent>
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
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-56" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Alert>
              <AlertTitle>No providers found</AlertTitle>
              <AlertDescription>
                Create a provider to make it available to calendars across organizations.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last tested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isImapTesting =
                    imapTestMutation.isPending && imapTestMutation.variables?.providerId === row.id;
                  const isSmtpTesting =
                    smtpTestMutation.isPending && smtpTestMutation.variables?.providerId === row.id;
                  const isDeleting =
                    deleteMutation.isPending && deleteMutation.variables?.providerId === row.id;

                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-sm text-foreground">{row.name}</span>
                          <span className="text-xs text-muted-foreground">ID: {row.id}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.category}</TableCell>
                      <TableCell>{renderStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{renderLastTestedAt(row.lastTestedAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isImapTesting || isDeleting}
                            onClick={() => imapTestMutation.mutate({ providerId: row.id })}
                            aria-busy={isImapTesting}
                          >
                            Test IMAP
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSmtpTesting || isDeleting}
                            onClick={() => smtpTestMutation.mutate({ providerId: row.id })}
                            aria-busy={isSmtpTesting}
                          >
                            Test SMTP
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => router.push(`/admin/providers/${row.id}`)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isDeleting || isImapTesting || isSmtpTesting}
                            onClick={() => deleteMutation.mutate({ providerId: row.id })}
                            aria-busy={isDeleting}
                          >
                            Delete
                          </Button>
                        </div>
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
