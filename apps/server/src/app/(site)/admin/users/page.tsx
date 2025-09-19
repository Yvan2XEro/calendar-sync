"use client";

import { RedirectToSignIn, UserAvatar } from "@daveyplate/better-auth-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import AppShell from "@/components/layout/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
        Card,
        CardContent,
        CardDescription,
        CardHeader,
        CardTitle,
} from "@/components/ui/card";
import {
        DropdownMenu,
        DropdownMenuCheckboxItem,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
        Pagination,
        PaginationContent,
        PaginationItem,
        PaginationLink,
        PaginationNext,
        PaginationPrevious,
} from "@/components/ui/pagination";
import {
        Select,
        SelectContent,
        SelectItem,
        SelectTrigger,
        SelectValue,
} from "@/components/ui/select";
import {
        Table,
        TableBody,
        TableCell,
        TableHead,
        TableHeader,
        TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { trpcClient } from "@/lib/trpc-client";

const statusOptions = [
        { label: "All statuses", value: "all" },
        { label: "Active", value: "active" },
        { label: "Banned", value: "banned" },
] as const;

type SortField = "createdAt" | "name" | "email";
type SortDir = "asc" | "desc";

type ListParams = {
        q?: string;
        roles?: string[];
        status?: "active" | "banned" | "all";
        calendarId?: string;
        page: number;
        pageSize: number;
        sort: { field: SortField; dir: SortDir };
};

function useDebouncedValue<T>(value: T, delay = 400) {
        const [debounced, setDebounced] = React.useState(value);

        React.useEffect(() => {
                const timeout = window.setTimeout(() => setDebounced(value), delay);
                return () => window.clearTimeout(timeout);
        }, [value, delay]);

        return debounced;
}

export default function AdminUsersPage() {
        const queryClient = useQueryClient();
        const [search, setSearch] = React.useState("");
        const [selectedRoles, setSelectedRoles] = React.useState<string[]>([]);
        const [status, setStatus] = React.useState<(typeof statusOptions)[number]["value"]>("all");
        const [calendarId, setCalendarId] = React.useState<string | "">("");
        const [page, setPage] = React.useState(1);
        const [pageSize, setPageSize] = React.useState(25);
        const [sort, setSort] = React.useState<{ field: SortField; dir: SortDir }>({
                field: "createdAt",
                dir: "desc",
        });
        const [resettingUserId, setResettingUserId] = React.useState<string | null>(null);

        const debouncedSearch = useDebouncedValue(search);

        React.useEffect(() => {
                setPage(1);
        }, [debouncedSearch, selectedRoles, status, calendarId, pageSize]);

        const listParams = React.useMemo<ListParams>(
                () => ({
                        ...(debouncedSearch ? { q: debouncedSearch } : {}),
                        ...(selectedRoles.length ? { roles: selectedRoles } : {}),
                        status,
                        ...(calendarId ? { calendarId } : {}),
                        page,
                        pageSize,
                        sort,
                }),
                [calendarId, debouncedSearch, page, pageSize, selectedRoles, sort, status],
        );

        const listKey = React.useMemo(() => ["adminUsers", "list", listParams] as const, [listParams]);

        const listQuery = useQuery({
                queryKey: listKey,
                queryFn: () => trpcClient.adminUsers.list.query(listParams),
                keepPreviousData: true,
        });

        const rolesQuery = useQuery({
                queryKey: ["adminUsers", "rolesOptions"],
                queryFn: () => trpcClient.adminUsers.rolesOptions.query(),
        });

        const calendarsQuery = useQuery({
                queryKey: ["adminUsers", "calendarsOptions"],
                queryFn: () => trpcClient.adminUsers.calendarsOptions.query(),
        });

        const banMutation = useMutation({
                mutationKey: ["adminUsers", "ban"],
                mutationFn: (input: { userId: string }) => trpcClient.adminUsers.ban.mutate(input),
                onMutate: async ({ userId }) => {
                        await queryClient.cancelQueries({ queryKey: listKey });
                        const previous = queryClient.getQueryData(listKey) as Awaited<typeof listQuery.data> | undefined;
                        if (previous) {
                                queryClient.setQueryData(listKey, {
                                        ...previous,
                                        items: previous.items.map((item) =>
                                                item.userId === userId ? { ...item, isBanned: true } : item,
                                        ),
                                });
                        }
                        return { previous };
                },
                onError: (error, _variables, context) => {
                        if (context?.previous) {
                                queryClient.setQueryData(listKey, context.previous);
                        }
                        toast.error(error instanceof Error ? error.message : "Unable to ban user");
                },
                onSuccess: () => {
                        toast.success("User banned");
                },
                onSettled: () => {
                        queryClient.invalidateQueries({ queryKey: listKey });
                },
        });

        const reactivateMutation = useMutation({
                mutationKey: ["adminUsers", "reactivate"],
                mutationFn: (input: { userId: string }) => trpcClient.adminUsers.reactivate.mutate(input),
                onMutate: async ({ userId }) => {
                        await queryClient.cancelQueries({ queryKey: listKey });
                        const previous = queryClient.getQueryData(listKey) as Awaited<typeof listQuery.data> | undefined;
                        if (previous) {
                                queryClient.setQueryData(listKey, {
                                        ...previous,
                                        items: previous.items.map((item) =>
                                                item.userId === userId ? { ...item, isBanned: false } : item,
                                        ),
                                });
                        }
                        return { previous };
                },
                onError: (error, _variables, context) => {
                        if (context?.previous) {
                                queryClient.setQueryData(listKey, context.previous);
                        }
                        toast.error(error instanceof Error ? error.message : "Unable to reactivate user");
                },
                onSuccess: () => {
                        toast.success("User reactivated");
                },
                onSettled: () => {
                        queryClient.invalidateQueries({ queryKey: listKey });
                },
        });

        const totalPages = listQuery.data ? Math.max(1, Math.ceil(listQuery.data.total / listQuery.data.pageSize)) : 1;

        const handleToggleRole = React.useCallback(
                (role: string) => {
                        setSelectedRoles((prev) => {
                                const next = prev.includes(role)
                                        ? prev.filter((item) => item !== role)
                                        : [...prev, role];
                                return next;
                        });
                },
                [],
        );

        const handleSort = React.useCallback(
                (field: SortField) => {
                        setSort((current) => {
                                if (current.field !== field) {
                                        return { field, dir: "asc" };
                                }
                                return { field, dir: current.dir === "asc" ? "desc" : "asc" };
                        });
                },
                [],
        );

        const isLoading = listQuery.isPending;
        const rows = listQuery.data?.items ?? [];
        const summaryStart = listQuery.data && listQuery.data.total > 0
                ? (listQuery.data.page - 1) * listQuery.data.pageSize + 1
                : 0;
        const summaryEnd = listQuery.data && listQuery.data.total > 0
                ? Math.min(listQuery.data.total, listQuery.data.page * listQuery.data.pageSize)
                : 0;

        const handleSendReset = React.useCallback(
                async (userId: string, email: string) => {
                        try {
                                setResettingUserId(userId);
                                const redirectTo = typeof window !== "undefined"
                                        ? `${window.location.origin}/auth/reset-password`
                                        : undefined;
                                await authClient.$fetch("/api/auth/request-password-reset", {
                                        method: "POST",
                                        body: {
                                                email,
                                                redirectTo,
                                        },
                                });
                                toast.success("Password reset email sent");
                        } catch (error) {
                                toast.error(error instanceof Error ? error.message : "Unable to send reset email");
                        } finally {
                                setResettingUserId(null);
                        }
                },
                [],
        );

        return (
                <AppShell
                        breadcrumbs={[
                                { label: "Admin", href: "/admin/overview" },
                                { label: "Users", current: true },
                        ]}
                        headerRight={<UserAvatar />}
                >
                        <RedirectToSignIn />
                        <Card>
                                <CardHeader className="gap-4 md:flex md:items-start md:justify-between">
                                        <div>
                                                <CardTitle>User management</CardTitle>
                                                <CardDescription>Search, filter, and manage every user across the workspace.</CardDescription>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                                <Input
                                                        value={search}
                                                        onChange={(event) => setSearch(event.target.value)}
                                                        placeholder="Search by name or email"
                                                        className="w-64"
                                                />
                                                <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                                <Button variant="outline" size="sm">
                                                                        Roles
                                                                        {selectedRoles.length > 0 ? (
                                                                                <span className="ml-2 rounded-full bg-secondary px-1.5 py-0.5 text-xs">
                                                                                        {selectedRoles.length}
                                                                                </span>
                                                                        ) : null}
                                                                </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent className="w-56">
                                                                <DropdownMenuLabel>Filter by role</DropdownMenuLabel>
                                                                <DropdownMenuSeparator />
                                                                {rolesQuery.data?.map((role) => (
                                                                        <DropdownMenuCheckboxItem
                                                                                key={role}
                                                                                checked={selectedRoles.includes(role)}
                                                                                onCheckedChange={() => handleToggleRole(role)}
                                                                        >
                                                                                {role}
                                                                        </DropdownMenuCheckboxItem>
                                                                ))}
                                                                {rolesQuery.isLoading ? (
                                                                        <DropdownMenuItem disabled>Loading roles…</DropdownMenuItem>
                                                                ) : null}
                                                                {rolesQuery.isError && !rolesQuery.data ? (
                                                                        <DropdownMenuItem disabled>Unable to load roles</DropdownMenuItem>
                                                                ) : null}
                                                        </DropdownMenuContent>
                                                </DropdownMenu>
                                                <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                                                        <SelectTrigger size="sm" className="w-36">
                                                                <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                                {statusOptions.map((option) => (
                                                                        <SelectItem key={option.value} value={option.value}>
                                                                                {option.label}
                                                                        </SelectItem>
                                                                ))}
                                                        </SelectContent>
                                                </Select>
                                                <Select
                                                        value={calendarId || "all"}
                                                        onValueChange={(value) => {
                                                                setCalendarId(value === "all" ? "" : value);
                                                        }}
                                                >
                                                        <SelectTrigger size="sm" className="w-44">
                                                                <SelectValue placeholder="All calendars" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                                <SelectItem value="all">All calendars</SelectItem>
                                                                {calendarsQuery.data?.map((calendar) => (
                                                                        <SelectItem key={calendar.id} value={calendar.id}>
                                                                                {calendar.name}
                                                                        </SelectItem>
                                                                ))}
                                                                {calendarsQuery.isLoading ? (
                                                                        <SelectItem value="loading" disabled>
                                                                                Loading calendars…
                                                                        </SelectItem>
                                                                ) : null}
                                                        </SelectContent>
                                                </Select>
                                                <Select
                                                        value={String(pageSize)}
                                                        onValueChange={(value) => setPageSize(Number(value))}
                                                >
                                                        <SelectTrigger size="sm" className="w-28">
                                                                <SelectValue placeholder="Page size" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                                {[10, 25, 50].map((size) => (
                                                                        <SelectItem key={size} value={String(size)}>
                                                                                {size} / page
                                                                        </SelectItem>
                                                                ))}
                                                        </SelectContent>
                                                </Select>
                                                <Select
                                                        value={sort.field}
                                                        onValueChange={(value) =>
                                                                setSort((current) => ({ field: value as SortField, dir: current.dir }))
                                                        }
                                                >
                                                        <SelectTrigger size="sm" className="w-40">
                                                                <SelectValue placeholder="Sort by" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                                <SelectItem value="createdAt">Created date</SelectItem>
                                                                <SelectItem value="name">Name</SelectItem>
                                                                <SelectItem value="email">Email</SelectItem>
                                                        </SelectContent>
                                                </Select>
                                                <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                                setSort((current) => ({
                                                                        ...current,
                                                                        dir: current.dir === "asc" ? "desc" : "asc",
                                                                }))
                                                        }
                                                >
                                                        {sort.dir === "asc" ? "Ascending" : "Descending"}
                                                </Button>
                                        </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                        {listQuery.isError ? (
                                                <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-destructive">
                                                        Unable to load users. {listQuery.error instanceof Error ? listQuery.error.message : "Please try again."}
                                                </div>
                                        ) : null}
                                        <div className="overflow-x-auto">
                                                <Table>
                                                        <TableHeader className="sticky top-0 z-10 bg-card">
                                                                <TableRow>
                                                                        <TableHead className="min-w-[220px]">
                                                                                <button
                                                                                        type="button"
                                                                                        className="flex items-center gap-1 font-medium"
                                                                                        onClick={() => handleSort("name")}
                                                                                >
                                                                                        User
                                                                                        {sort.field === "name" || sort.field === "email" ? (
                                                                                                <SortIndicator direction={sort.dir} />
                                                                                        ) : null}
                                                                                </button>
                                                                        </TableHead>
                                                                        <TableHead>Roles</TableHead>
                                                                        <TableHead>Calendars</TableHead>
                                                                        <TableHead>Status</TableHead>
                                                                        <TableHead>
                                                                                <button
                                                                                        type="button"
                                                                                        className="flex items-center gap-1 font-medium"
                                                                                        onClick={() => handleSort("createdAt")}
                                                                                >
                                                                                        Created
                                                                                        {sort.field === "createdAt" ? (
                                                                                                <SortIndicator direction={sort.dir} />
                                                                                        ) : null}
                                                                                </button>
                                                                        </TableHead>
                                                                        <TableHead className="text-right">Actions</TableHead>
                                                                </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                                {isLoading ? (
                                                                        Array.from({ length: Math.min(pageSize, 5) }).map((_, index) => (
                                                                                <TableRow key={index}>
                                                                                        <TableCell>
                                                                                                <div className="flex items-center gap-3">
                                                                                                        <div className="size-10 animate-pulse rounded-full bg-muted" />
                                                                                                        <div className="space-y-2">
                                                                                                                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                                                                                                                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                                                                                                        </div>
                                                                                                </div>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                                <div className="flex gap-1">
                                                                                                        <span className="h-5 w-12 animate-pulse rounded bg-muted" />
                                                                                                        <span className="h-5 w-12 animate-pulse rounded bg-muted" />
                                                                                                </div>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                                <div className="flex gap-1">
                                                                                                        <span className="h-5 w-14 animate-pulse rounded bg-muted" />
                                                                                                        <span className="h-5 w-14 animate-pulse rounded bg-muted" />
                                                                                                </div>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                                <span className="h-5 w-16 animate-pulse rounded bg-muted" />
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                                <span className="h-5 w-20 animate-pulse rounded bg-muted" />
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                                <span className="ml-auto block h-8 w-12 animate-pulse rounded bg-muted" />
                                                                                        </TableCell>
                                                                                </TableRow>
                                                                        ))
                                                                ) : rows.length === 0 ? (
                                                                        <TableRow>
                                                                                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                                                                                        No users found. Adjust your filters or try a different search.
                                                                                </TableCell>
                                                                        </TableRow>
                                                                ) : (
                                                                        rows.map((item) => {
                                                                                const statusLabel = item.isBanned ? "Banned" : "Active";
                                                                                const statusVariant = item.isBanned ? "destructive" : "secondary";
                                                                                const createdDate = item.createdAt ? new Date(item.createdAt) : undefined;
                                                                                const isBanning = banMutation.isPending && banMutation.variables?.userId === item.userId;
                                                                                const isReactivating =
                                                                                        reactivateMutation.isPending &&
                                                                                        reactivateMutation.variables?.userId === item.userId;
                                                                                const isResetting = resettingUserId === item.userId;

                                                                                return (
                                                                                        <TableRow key={item.userId}>
                                                                                                <TableCell>
                                                                                                        <div className="flex items-center gap-3">
                                                                                                                <Avatar className="size-10">
                                                                                                                        <AvatarImage src={item.avatarUrl} alt={item.name ?? item.email} />
                                                                                                                        <AvatarFallback>{item.name?.charAt(0).toUpperCase() ?? item.email.charAt(0).toUpperCase()}</AvatarFallback>
                                                                                                                </Avatar>
                                                                                                                <div>
                                                                                                                        <div className="font-medium text-sm text-foreground">{item.name || "Unnamed user"}</div>
                                                                                                                        <Link
                                                                                                                                href={`mailto:${item.email}`}
                                                                                                                                className="text-muted-foreground text-sm hover:underline"
                                                                                                                        >
                                                                                                                                {item.email}
                                                                                                                        </Link>
                                                                                                                </div>
                                                                                                        </div>
                                                                                                </TableCell>
                                                                                                <TableCell>
                                                                                                        <div className="flex flex-wrap gap-2">
                                                                                                                {item.roles.length === 0 ? (
                                                                                                                        <Badge variant="outline">user</Badge>
                                                                                                                ) : (
                                                                                                                        item.roles.map((role) => (
                                                                                                                                <Badge key={role} variant="outline">
                                                                                                                                        {role}
                                                                                                                                </Badge>
                                                                                                                        ))
                                                                                                                )}
                                                                                                        </div>
                                                                                                </TableCell>
                                                                                                <TableCell>
                                                                                                        <div className="flex flex-wrap gap-2">
                                                                                                                {item.calendars.map((calendar) => (
                                                                                                                        <Badge key={calendar.id} variant="secondary" className="max-w-[120px] truncate">
                                                                                                                                <span title={calendar.name}>{calendar.name}</span>
                                                                                                                        </Badge>
                                                                                                                ))}
                                                                                                                {item.calendarsOverflow > 0 ? (
                                                                                                                        <Badge variant="outline">+{item.calendarsOverflow}</Badge>
                                                                                                                ) : null}
                                                                                                        </div>
                                                                                                </TableCell>
                                                                                                <TableCell>
                                                                                                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                                                                                                </TableCell>
                                                                                                <TableCell>
                                                                                                        {createdDate ? (
                                                                                                                <Tooltip>
                                                                                                                        <TooltipTrigger asChild>
                                                                                                                                <span className="cursor-default text-sm text-muted-foreground">
                                                                                                                                        {formatDistanceToNow(createdDate, { addSuffix: true })}
                                                                                                                                </span>
                                                                                                                        </TooltipTrigger>
                                                                                                                        <TooltipContent>{createdDate.toISOString()}</TooltipContent>
                                                                                                                </Tooltip>
                                                                                                        ) : (
                                                                                                                <span className="text-muted-foreground text-sm">Unknown</span>
                                                                                                        )}
                                                                                                </TableCell>
                                                                                                <TableCell className="text-right">
                                                                                                        <DropdownMenu>
                                                                                                                <DropdownMenuTrigger asChild>
                                                                                                                        <Button
                                                                                                                                variant="ghost"
                                                                                                                                size="icon"
                                                                                                                                className="size-8"
                                                                                                                                aria-label="Open actions"
                                                                                                                        >
                                                                                                                                <MoreHorizontal className="size-4" />
                                                                                                                        </Button>
                                                                                                                </DropdownMenuTrigger>
                                                                                                                <DropdownMenuContent align="end">
                                                                                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                                                                        <DropdownMenuItem
                                                                                                                                disabled={isResetting}
                                                                                                                                onSelect={(event) => {
                                                                                                                                        event.preventDefault();
                                                                                                                                        void handleSendReset(item.userId, item.email);
                                                                                                                                }}
                                                                                                                        >
                                                                                                                                Send password reset email
                                                                                                                        </DropdownMenuItem>
                                                                                                                        <DropdownMenuSeparator />
                                                                                                                        {item.isBanned ? (
                                                                                                                                <DropdownMenuItem
                                                                                                                                        disabled={isReactivating}
                                                                                                                                        onSelect={(event) => {
                                                                                                                                                event.preventDefault();
                                                                                                                                                reactivateMutation.mutate({ userId: item.userId });
                                                                                                                                        }}
                                                                                                                                >
                                                                                                                                        Reactivate user
                                                                                                                                </DropdownMenuItem>
                                                                                                                        ) : (
                                                                                                                                <DropdownMenuItem
                                                                                                                                        disabled={isBanning}
                                                                                                                                        onSelect={(event) => {
                                                                                                                                                event.preventDefault();
                                                                                                                                                banMutation.mutate({ userId: item.userId });
                                                                                                                                        }}
                                                                                                                                >
                                                                                                                                        Ban user
                                                                                                                                </DropdownMenuItem>
                                                                                                                        )}
                                                                                                                </DropdownMenuContent>
                                                                                                        </DropdownMenu>
                                                                                                </TableCell>
                                                                                        </TableRow>
                                                                                );
                                                                        })
                                                                )}
                                                        </TableBody>
                                                </Table>
                                        </div>
                                        {listQuery.data ? (
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="text-sm text-muted-foreground">
                                                                Showing {summaryStart} to {summaryEnd} of {listQuery.data.total} users
                                                        </div>
                                                        <Pagination>
                                                                <PaginationContent>
                                                                        <PaginationItem>
                                                                                <PaginationPrevious
                                                                                        href="#"
                                                                                        onClick={(event) => {
                                                                                                event.preventDefault();
                                                                                                setPage((prev) => Math.max(1, prev - 1));
                                                                                        }}
                                                                                        aria-disabled={page === 1}
                                                                                        className={page === 1 ? "pointer-events-none opacity-50" : undefined}
                                                                                />
                                                                        </PaginationItem>
                                                                        <PaginationItem>
                                                                                <PaginationLink href="#" isActive>
                                                                                        {page}
                                                                                </PaginationLink>
                                                                        </PaginationItem>
                                                                        <PaginationItem>
                                                                                <PaginationNext
                                                                                        href="#"
                                                                                        onClick={(event) => {
                                                                                                event.preventDefault();
                                                                                                setPage((prev) => Math.min(totalPages, prev + 1));
                                                                                        }}
                                                                                        aria-disabled={page >= totalPages}
                                                                                        className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
                                                                                />
                                                                        </PaginationItem>
                                                                </PaginationContent>
                                                        </Pagination>
                                                </div>
                                        ) : null}
                                </CardContent>
                        </Card>
                </AppShell>
        );
}

type SortIndicatorProps = { direction: SortDir };

function SortIndicator({ direction }: SortIndicatorProps) {
        return (
                <span aria-hidden className="text-muted-foreground text-xs">
                        {direction === "asc" ? "▲" : "▼"}
                </span>
        );
}
