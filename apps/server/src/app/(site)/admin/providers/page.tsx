"use client";

import { RedirectToSignIn, UserAvatar } from "@daveyplate/better-auth-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { trpcClient } from "@/lib/trpc-client";

type ProviderRow = Awaited<
	ReturnType<typeof trpcClient.providers.list.query>
>[number];

type ProviderStatus = ProviderRow["status"];

const PROVIDERS_QUERY_KEY = ["providers", "catalog"] as const;

type ToggleStatusVariables = {
	id: string;
	name: string;
	nextStatus: ProviderStatus;
};

export default function ProvidersAdminPage() {
	const router = useRouter();
	const queryClient = useQueryClient();

	const providersQuery = useQuery({
		queryKey: PROVIDERS_QUERY_KEY,
		queryFn: async () => {
			const rows = await trpcClient.providers.list.query();
			return Array.isArray(rows) ? rows : [];
		},
	});

	const toggleStatusMutation = useMutation({
		mutationFn: async ({ id, nextStatus }: ToggleStatusVariables) => {
			// Placeholder mutation until dedicated status endpoints are available.
			await trpcClient.providers.list.query();

			return { id, status: nextStatus };
		},
		onSuccess: (_, variables) => {
			toast.success(
				`${variables.nextStatus === "active" ? "Resumed" : "Paused"} ${variables.name}`,
			);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update provider status",
			);
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
		},
	});

	const rows = providersQuery.data ?? [];

	const renderStatusBadge = (status: ProviderStatus) => {
		const normalized = status ?? "draft";
		const variant = normalized === "active" ? "default" : "secondary";
		const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);

		return <Badge variant={variant}>{label}</Badge>;
	};

	const handleEdit = (id: string) => {
		router.push(`/admin/providers/${id}`);
	};

	const handleToggleStatus = (row: ProviderRow) => {
		const isActive = row.status === "active" || row.status === "beta";
		const nextStatus = (isActive ? "draft" : "active") as ProviderStatus;

		toggleStatusMutation.mutate({
			id: row.id,
			name: row.name,
			nextStatus,
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
						Manage the providers available to all organizations.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{providersQuery.isError ? (
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
								Start by configuring a provider to make it available to
								organizations.
							</AlertDescription>
						</Alert>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Category</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => {
									const isMutating =
										toggleStatusMutation.isPending &&
										toggleStatusMutation.variables?.id === row.id;
									const isActive =
										row.status === "active" || row.status === "beta";
									const toggleLabel = isActive ? "Pause" : "Resume";

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
											<TableCell>{renderStatusBadge(row.status)}</TableCell>
											<TableCell>
												<div className="flex justify-end gap-2">
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleEdit(row.id)}
													>
														Edit
													</Button>
													<Button
														variant={isActive ? "ghost" : "default"}
														size="sm"
														onClick={() => handleToggleStatus(row)}
														disabled={isMutating}
													>
														{isMutating ? "Updating..." : toggleLabel}
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
