"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { MoreHorizontal, Plus } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
import type { AppRouter } from "@/routers";

const priorityOptions = [1, 2, 3, 4, 5] as const;

const flagFormSchema = z.object({
	label: z.string().min(1, "Label is required"),
	slug: z.string().min(1, "Slug is required"),
	description: z.string().optional(),
	priority: z.coerce
		.number()
		.refine((value) => !Number.isNaN(value), {
			message: "Priority is required",
		})
		.int("Priority must be an integer")
		.min(1, "Priority must be between 1 and 5")
		.max(5, "Priority must be between 1 and 5"),
});

type FlagFormValues = z.input<typeof flagFormSchema>;
type FlagFormOutput = z.output<typeof flagFormSchema>;
type AdminFlagOutputs = inferRouterOutputs<AppRouter>["adminFlags"];
type Flag = AdminFlagOutputs["listFlags"][number];
type FlagListOutput = AdminFlagOutputs["listFlags"];

const defaultValues: FlagFormValues = {
	label: "",
	slug: "",
	description: "",
	priority: 3,
};

const listQueryKey = ["adminFlags", "list"] as const;

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export default function AdminFlagsPage() {
	const queryClient = useQueryClient();
	const [formOpen, setFormOpen] = React.useState(false);
	const [editingFlag, setEditingFlag] = React.useState<Flag | null>(null);
	const [autoSlug, setAutoSlug] = React.useState(true);
	const [deleteOpen, setDeleteOpen] = React.useState(false);
	const [flagPendingDelete, setFlagPendingDelete] = React.useState<Flag | null>(
		null,
	);

	const form = useForm<FlagFormValues>({
		resolver: zodResolver<FlagFormValues, undefined, FlagFormOutput>(
			flagFormSchema,
		),
		defaultValues,
	});

	const flagsQuery = useQuery<FlagListOutput>({
		queryKey: listQueryKey,
		queryFn: () => trpcClient.adminFlags.listFlags.query(),
	});

	const createMutation = useMutation({
		mutationFn: (input: FlagFormOutput) =>
			trpcClient.adminFlags.createFlag.mutate(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: listQueryKey });
		},
	});

	const updateMutation = useMutation({
		mutationFn: (input: FlagFormOutput & { id: string }) =>
			trpcClient.adminFlags.updateFlag.mutate(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: listQueryKey });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (input: { id: string }) =>
			trpcClient.adminFlags.deleteFlag.mutate(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: listQueryKey });
			setDeleteOpen(false);
			setFlagPendingDelete(null);
			toast.success("Flag deleted");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Unable to delete flag",
			);
		},
	});

	const dateFormatter = React.useMemo(
		() =>
			new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}),
		[],
	);

	const closeForm = React.useCallback(() => {
		setFormOpen(false);
		setEditingFlag(null);
		setAutoSlug(true);
		form.reset(defaultValues);
	}, [form]);

	const handleCreateClick = React.useCallback(() => {
		form.reset(defaultValues);
		setEditingFlag(null);
		setAutoSlug(true);
		setFormOpen(true);
	}, [form]);

	const handleEditClick = React.useCallback(
		(flagToEdit: Flag) => {
			form.reset({
				label: flagToEdit.label,
				slug: flagToEdit.slug,
				description: flagToEdit.description ?? "",
				priority: flagToEdit.priority,
			});
			setEditingFlag(flagToEdit);
			setAutoSlug(false);
			setFormOpen(true);
		},
		[form],
	);

	const handleDeleteRequest = React.useCallback((flagToDelete: Flag) => {
		setFlagPendingDelete(flagToDelete);
		setDeleteOpen(true);
	}, []);

	const handleConfirmDelete = React.useCallback(() => {
		if (!flagPendingDelete) return;
		deleteMutation.mutate({ id: flagPendingDelete.id });
	}, [deleteMutation, flagPendingDelete]);

	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	const onSubmit = form.handleSubmit(async (values) => {
		const normalizedSlug = slugify(values.slug);
		const trimmedLabel = values.label.trim();
		const trimmedDescription = values.description?.trim() ?? "";

		if (normalizedSlug !== values.slug) {
			form.setValue("slug", normalizedSlug, { shouldValidate: true });
		}

		const payload: FlagFormOutput = flagFormSchema.parse({
			...values,
			label: trimmedLabel,
			slug: normalizedSlug,
			description: trimmedDescription,
		});

		try {
			if (editingFlag) {
				await updateMutation.mutateAsync({ id: editingFlag.id, ...payload });
				toast.success("Flag updated");
			} else {
				await createMutation.mutateAsync(payload);
				toast.success("Flag created");
			}

			closeForm();
		} catch (error) {
			if (error instanceof TRPCClientError) {
				const code = (error as TRPCClientError<AppRouter>).data?.code;
				if (code === "CONFLICT") {
					form.setError("slug", {
						type: "manual",
						message: "Slug already exists",
					});
					return;
				}
			}

			toast.error(
				error instanceof Error ? error.message : "Unable to save flag",
			);
		}
	});

	const flags = flagsQuery.data ?? [];

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{ label: "Flags", current: true },
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />
			<Card>
				<CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1">
						<CardTitle>Feature flags</CardTitle>
						<CardDescription>
							Manage feature flags, rollouts, and priority levels for the
							workspace.
						</CardDescription>
					</div>
					<div>
						<Button type="button" onClick={handleCreateClick}>
							<Plus className="mr-2 size-4" />
							Create flag
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{flagsQuery.isError ? (
						<div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-destructive text-sm">
							{flagsQuery.error instanceof Error
								? flagsQuery.error.message
								: "Unable to load flags"}
						</div>
					) : null}
					<div className="overflow-hidden rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="min-w-[160px]">Label</TableHead>
									<TableHead className="min-w-[140px]">Slug</TableHead>
									<TableHead>Description</TableHead>
									<TableHead className="w-[100px]">Priority</TableHead>
									<TableHead className="min-w-[180px]">Created</TableHead>
									<TableHead className="w-[72px] text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{flagsQuery.isLoading ? (
									Array.from({ length: 4 }).map((_, index) => (
										<TableRow key={`skeleton-${index}`}>
											<TableCell>
												<Skeleton className="h-5 w-32" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-5 w-24" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-5 w-48" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-5 w-12" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-5 w-36" />
											</TableCell>
											<TableCell className="text-right">
												<Skeleton className="ml-auto h-8 w-8" />
											</TableCell>
										</TableRow>
									))
								) : flags.length > 0 ? (
									flags.map((flagItem) => (
										<TableRow key={flagItem.id}>
											<TableCell className="font-medium">
												{flagItem.label}
											</TableCell>
											<TableCell className="text-muted-foreground text-sm">
												{flagItem.slug}
											</TableCell>
											<TableCell className="max-w-xs truncate text-muted-foreground text-sm">
												{flagItem.description ?? "—"}
											</TableCell>
											<TableCell>{flagItem.priority}</TableCell>
											<TableCell className="text-muted-foreground text-sm">
												{dateFormatter.format(new Date(flagItem.createdAt))}
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
															onSelect={(event) => {
																event.preventDefault();
																handleEditClick(flagItem);
															}}
														>
															Edit
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															className="text-destructive focus:text-destructive"
															onSelect={(event) => {
																event.preventDefault();
																handleDeleteRequest(flagItem);
															}}
														>
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											colSpan={6}
											className="h-24 text-center text-muted-foreground"
										>
											No flags found. Create your first flag to get started.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<Dialog
				open={formOpen}
				onOpenChange={(open) => {
					if (!open) {
						closeForm();
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							{editingFlag ? "Edit flag" : "Create flag"}
						</DialogTitle>
						<DialogDescription>
							Define the name, slug, and priority for this flag.
						</DialogDescription>
					</DialogHeader>
					<Form {...form}>
						<form className="mt-6 space-y-6" onSubmit={onSubmit}>
							<FormField
								control={form.control}
								name="label"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Label</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder="New flag label"
												onChange={(event) => {
													field.onChange(event.target.value);
													if (autoSlug) {
														const nextSlug = slugify(event.target.value);
														form.setValue("slug", nextSlug);
													}
												}}
												autoFocus
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="slug"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Slug</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder="flag-slug"
												onChange={(event) => {
													setAutoSlug(false);
													field.onChange(event.target.value);
												}}
												onBlur={(event) => {
													field.onBlur();
													const normalized = slugify(event.target.value);
													form.setValue("slug", normalized, {
														shouldValidate: true,
													});
												}}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description</FormLabel>
										<FormControl>
											<textarea
												{...field}
												rows={4}
												placeholder="Describe what this flag controls"
												className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="priority"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Priority</FormLabel>
										<Select
											value={String(field.value ?? "")}
											onValueChange={(value) => field.onChange(Number(value))}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select a priority" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{priorityOptions.map((option) => (
													<SelectItem key={option} value={String(option)}>
														Priority {option}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<DialogFooter className="gap-2 sm:justify-end">
								<Button
									type="button"
									variant="outline"
									onClick={() => closeForm()}
									disabled={isSubmitting}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting
										? "Saving..."
										: editingFlag
											? "Save changes"
											: "Create flag"}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={deleteOpen}
				onOpenChange={(open) => {
					setDeleteOpen(open);
					if (!open) {
						setFlagPendingDelete(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete flag</AlertDialogTitle>
						<AlertDialogDescription>
							{flagPendingDelete
								? `This will permanently delete the "${flagPendingDelete.label}" flag.`
								: "This will permanently delete the selected flag."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteMutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={handleConfirmDelete}
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</AppShell>
	);
}
