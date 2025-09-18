"use client";

import {
	RedirectToSignIn,
	UserAvatar,
	useCurrentOrganization,
} from "@daveyplate/better-auth-ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import {
	AlertCircle,
	CheckCircle2,
	Pause,
	Play,
	RefreshCw,
} from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type FieldPath, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { trpcClient } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import type { AppRouter } from "@/routers";

const providerDraftSchema = z.object({
	displayName: z.string().min(1, "A display name is required"),
	email: z
		.string()
		.min(1, "A valid email is required")
		.email({ message: "A valid email is required" }),
	imap: z.object({
		host: z.string().min(1, "IMAP host is required"),
		port: z
			.number({ invalid_type_error: "IMAP port is required" })
			.int("IMAP port must be a whole number")
			.min(1, "IMAP port must be greater than zero"),
		secure: z.boolean(),
		auth: z.object({
			user: z.string().min(1, "IMAP username is required"),
			pass: z.string().min(1, "IMAP password is required"),
		}),
	}),
	smtp: z.object({
		host: z.string().min(1, "SMTP host is required"),
		port: z
			.number({ invalid_type_error: "SMTP port is required" })
			.int("SMTP port must be a whole number")
			.min(1, "SMTP port must be greater than zero"),
		secure: z.boolean(),
		from: z
			.preprocess((value) => {
				if (typeof value !== "string") {
					return value;
				}

				const trimmed = value.trim();
				return trimmed.length === 0 ? undefined : trimmed;
			}, z
				.string()
				.email({ message: "A valid From address is required" })
				.optional())
			.optional(),
		auth: z.object({
			user: z.string().min(1, "SMTP username is required"),
			pass: z.string().min(1, "SMTP password is required"),
		}),
	}),
});

export type ProviderDraftFormValues = z.infer<typeof providerDraftSchema>;

type ProviderConfig = {
	displayName: string;
	email: string;
	imap: {
		host: string;
		port: number;
		secure: boolean;
		authUser: string;
	};
	smtp: {
		host: string;
		port: number;
		secure: boolean;
		authUser: string;
		from?: string | null;
	};
};

type ProviderCatalogRecord = {
	id: string;
	name: string;
	description?: string | null;
};

type ProviderGetResponse = {
	provider: ProviderCatalogRecord;
	config: ProviderConfig | null;
	status: string | null;
	lastTestedAt: string | null;
	imapTestOk: boolean;
	hasSecrets: boolean;
};

type ProviderDraftResponse = {
	draft: Partial<ProviderDraftFormValues> | null;
};

type ProviderTestResponse = {
	ok: boolean;
};

type ProviderStatusResponse = {
	status: string;
};

type ProviderUpsertResponse = {
	providerId: string;
	status: string;
	lastTestedAt: string | null;
	imapTestOk: boolean;
	config: ProviderConfig;
	hasSecrets: boolean;
};

const DEFAULT_DRAFT: ProviderDraftFormValues = {
	displayName: "",
	email: "",
	imap: {
		host: "",
		port: 993,
		secure: true,
		auth: {
			user: "",
			pass: "",
		},
	},
	smtp: {
		host: "",
		port: 465,
		secure: true,
		from: undefined,
		auth: {
			user: "",
			pass: "",
		},
	},
};

function toFormDraft(
	draft?: Partial<ProviderDraftFormValues> | null,
	config?: ProviderConfig | null,
): ProviderDraftFormValues {
	if (draft) {
		return {
			displayName: draft.displayName ?? DEFAULT_DRAFT.displayName,
			email: draft.email ?? DEFAULT_DRAFT.email,
			imap: {
				host: draft.imap?.host ?? DEFAULT_DRAFT.imap.host,
				port: draft.imap?.port ?? DEFAULT_DRAFT.imap.port,
				secure: draft.imap?.secure ?? DEFAULT_DRAFT.imap.secure,
				auth: {
					user: draft.imap?.auth?.user ?? DEFAULT_DRAFT.imap.auth.user,
					pass: draft.imap?.auth?.pass ?? DEFAULT_DRAFT.imap.auth.pass,
				},
			},
			smtp: {
				host: draft.smtp?.host ?? DEFAULT_DRAFT.smtp.host,
				port: draft.smtp?.port ?? DEFAULT_DRAFT.smtp.port,
				secure: draft.smtp?.secure ?? DEFAULT_DRAFT.smtp.secure,
				from: draft.smtp?.from ?? DEFAULT_DRAFT.smtp.from,
				auth: {
					user: draft.smtp?.auth?.user ?? DEFAULT_DRAFT.smtp.auth.user,
					pass: draft.smtp?.auth?.pass ?? DEFAULT_DRAFT.smtp.auth.pass,
				},
			},
		} satisfies ProviderDraftFormValues;
	}

	if (config) {
		return {
			displayName: config.displayName ?? DEFAULT_DRAFT.displayName,
			email: config.email ?? DEFAULT_DRAFT.email,
			imap: {
				host: config.imap?.host ?? DEFAULT_DRAFT.imap.host,
				port: config.imap?.port ?? DEFAULT_DRAFT.imap.port,
				secure: config.imap?.secure ?? DEFAULT_DRAFT.imap.secure,
				auth: {
					user: config.imap?.authUser ?? DEFAULT_DRAFT.imap.auth.user,
					pass: DEFAULT_DRAFT.imap.auth.pass,
				},
			},
			smtp: {
				host: config.smtp?.host ?? DEFAULT_DRAFT.smtp.host,
				port: config.smtp?.port ?? DEFAULT_DRAFT.smtp.port,
				secure: config.smtp?.secure ?? DEFAULT_DRAFT.smtp.secure,
				from: config.smtp?.from ?? DEFAULT_DRAFT.smtp.from,
				auth: {
					user: config.smtp?.authUser ?? DEFAULT_DRAFT.smtp.auth.user,
					pass: DEFAULT_DRAFT.smtp.auth.pass,
				},
			},
		} satisfies ProviderDraftFormValues;
	}

	return DEFAULT_DRAFT;
}

function sanitizeDraft(
	values: ProviderDraftFormValues,
): ProviderDraftFormValues {
	return {
		...values,
		smtp: {
			...values.smtp,
			from: values.smtp.from ? values.smtp.from : undefined,
		},
	} satisfies ProviderDraftFormValues;
}

function formatDateTime(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date);
	} catch (_error) {
		return date.toLocaleString();
	}
}

function isTRPCError(error: unknown): error is TRPCClientError<AppRouter> {
	return error instanceof TRPCClientError;
}

export default function ProviderDraftPage() {
	const params = useParams();
	const searchParams = useSearchParams();
	const queryClient = useQueryClient();
	const [serverError, setServerError] = useState<string | null>(null);

	const providerIdParam = params?.providerId;
	const providerId = Array.isArray(providerIdParam)
		? providerIdParam[0]
		: (providerIdParam ?? "");

	const slugFromQuery = searchParams?.get("slug") ?? undefined;
	const { data: organization } = useCurrentOrganization({
		slug: slugFromQuery,
	});
	const slug = useMemo(
		() => slugFromQuery ?? organization?.slug ?? undefined,
		[organization?.slug, slugFromQuery],
	);

	const providerQueryKey = useMemo(
		() => ["providers", "get", slug, providerId],
		[providerId, slug],
	);

	const draftQueryKey = useMemo(
		() => ["providers", "draft", slug, providerId],
		[providerId, slug],
	);

	const providerQuery = useQuery({
		queryKey: providerQueryKey,
		enabled: Boolean(slug && providerId),
		queryFn: async () => {
			if (!slug) {
				throw new Error("Calendar slug is not available");
			}
			const response = await trpcClient.query("providers.get", {
				slug,
				providerId,
			});

			return response as ProviderGetResponse;
		},
	});

	const providerClient = trpcClient as unknown as {
		providers: {
			draft: {
				query: (input: {
					slug: string;
					providerId: string;
				}) => Promise<ProviderDraftResponse>;
			};
			pause: {
				mutate: (input: {
					slug: string;
					providerId: string;
				}) => Promise<ProviderStatusResponse>;
			};
			resume: {
				mutate: (input: {
					slug: string;
					providerId: string;
				}) => Promise<ProviderStatusResponse>;
			};
		};
	};

	const draftQuery = useQuery({
		queryKey: draftQueryKey,
		enabled: Boolean(slug && providerId),
		queryFn: async () => {
			if (!slug) {
				throw new Error("Calendar slug is not available");
			}
			const response = await providerClient.providers.draft.query({
				slug,
				providerId,
			});

			return response;
		},
	});

	const form = useForm<ProviderDraftFormValues>({
		resolver: zodResolver(providerDraftSchema),
		defaultValues: DEFAULT_DRAFT,
	});
	const { isDirty } = form.formState;

	useEffect(() => {
		if (!isDirty) {
			const nextValues = toFormDraft(
				draftQuery.data?.draft,
				providerQuery.data?.config,
			);
			form.reset(nextValues);
		}
	}, [draftQuery.data?.draft, form, isDirty, providerQuery.data?.config]);

	const saveMutation = useMutation({
		mutationFn: async (values: ProviderDraftFormValues) => {
			if (!slug) {
				throw new Error("Calendar slug is not available");
			}
			const sanitized = sanitizeDraft(values);

			const response = await trpcClient.mutation("providers.upsert", {
				slug,
				providerId,
				draft: sanitized,
			});

			return response as ProviderUpsertResponse;
		},
		onSuccess: (data, variables) => {
			toast.success("Provider settings saved");
			setServerError(null);
			form.reset(variables);
			queryClient.setQueryData(draftQueryKey, { draft: variables });
			queryClient.invalidateQueries({ queryKey: providerQueryKey });
			queryClient.invalidateQueries({ queryKey: draftQueryKey });
			if (data) {
				queryClient.setQueryData(
					providerQueryKey,
					(existing: ProviderGetResponse | undefined) =>
						existing
							? {
									...existing,
									status: data.status ?? existing.status,
									lastTestedAt: data.lastTestedAt,
									imapTestOk: data.imapTestOk,
									config: data.config ?? existing.config,
									hasSecrets: data.hasSecrets,
								}
							: existing,
				);
			}
		},
		onError: (error) => {
			if (isTRPCError(error)) {
				const message =
					error?.data?.zodError?.formErrors?.join("\n") ||
					error.message ||
					"Unable to save provider";
				setServerError(message);

				const fieldErrors = error?.data?.zodError?.fieldErrors;
				if (fieldErrors) {
					for (const [path, messages] of Object.entries(fieldErrors)) {
						const messageText = messages?.[0];
						if (!messageText) {
							continue;
						}

						const fieldPath = path as FieldPath<ProviderDraftFormValues>;
						form.setError(fieldPath, { message: messageText });
					}
				}
			} else {
				setServerError("Unable to save provider");
			}
		},
	});

	const testImapMutation = useMutation({
		mutationFn: async () => {
			if (!slug) {
				throw new Error("Calendar slug is not available");
			}
			const values = sanitizeDraft(form.getValues());
			const response = await trpcClient.mutation("providers.testImap", {
				slug,
				providerId,
				imap: values.imap,
			});

			return response as ProviderTestResponse;
		},
		onSuccess: () => {
			toast.success("IMAP connection verified");
			queryClient.invalidateQueries({ queryKey: providerQueryKey });
		},
		onError: (error) => {
			const message = isTRPCError(error)
				? error.message || "IMAP connection failed"
				: "IMAP connection failed";
			toast.error(message);
		},
	});

	const testSmtpMutation = useMutation({
		mutationFn: async () => {
			if (!slug) {
				throw new Error("Calendar slug is not available");
			}
			const values = sanitizeDraft(form.getValues());
			const response = await trpcClient.mutation("providers.testSmtp", {
				slug,
				providerId,
				smtp: values.smtp,
			});

			return response as ProviderTestResponse;
		},
		onSuccess: () => {
			toast.success("SMTP connection verified");
			queryClient.invalidateQueries({ queryKey: providerQueryKey });
		},
		onError: (error) => {
			const message = isTRPCError(error)
				? error.message || "SMTP connection failed"
				: "SMTP connection failed";
			toast.error(message);
		},
	});

	const pauseMutation = useMutation({
		mutationFn: async () => {
			if (!slug) {
				throw new Error("Calendar slug is not available");
			}
			const response = await providerClient.providers.pause.mutate({
				slug,
				providerId,
			});

			return response;
		},
		onSuccess: (data) => {
			toast.success("Provider paused");
			queryClient.invalidateQueries({ queryKey: providerQueryKey });
			if (data?.status) {
				queryClient.setQueryData(
					providerQueryKey,
					(existing: ProviderGetResponse | undefined) =>
						existing
							? {
									...existing,
									status: data.status,
								}
							: existing,
				);
			}
		},
		onError: (error) => {
			const message = isTRPCError(error)
				? error.message || "Unable to pause provider"
				: "Unable to pause provider";
			toast.error(message);
		},
	});

	const resumeMutation = useMutation({
		mutationFn: async () => {
			if (!slug) {
				throw new Error("Calendar slug is not available");
			}
			const response = await providerClient.providers.resume.mutate({
				slug,
				providerId,
			});

			return response;
		},
		onSuccess: (data) => {
			toast.success("Provider resumed");
			queryClient.invalidateQueries({ queryKey: providerQueryKey });
			if (data?.status) {
				queryClient.setQueryData(
					providerQueryKey,
					(existing: ProviderGetResponse | undefined) =>
						existing
							? {
									...existing,
									status: data.status,
								}
							: existing,
				);
			}
		},
		onError: (error) => {
			const message = isTRPCError(error)
				? error.message || "Unable to resume provider"
				: "Unable to resume provider";
			toast.error(message);
		},
	});

	const isLoading = providerQuery.isPending || draftQuery.isPending;
	const isErrored = providerQuery.isError || draftQuery.isError;

	const status = providerQuery.data?.status ?? null;
	const isPaused = status === "paused";
	const disableInputs = isLoading || !slug || !providerId;

	const handleSubmit = form.handleSubmit(async (values) => {
		setServerError(null);
		await saveMutation.mutateAsync(values);
	});

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{ label: "Providers", href: "/admin/providers" },
				{
					label: providerQuery.data?.provider.name ?? providerId ?? "Provider",
					current: true,
				},
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />

			{!slug ? (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertTitle>Calendar context required</AlertTitle>
					<AlertDescription>
						Select a calendar before configuring provider credentials.
					</AlertDescription>
				</Alert>
			) : null}

			{isErrored ? (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertTitle>Unable to load provider details</AlertTitle>
					<AlertDescription>
						{(providerQuery.error as Error | undefined)?.message ??
							(draftQuery.error as Error | undefined)?.message ??
							"Please try again or refresh the page."}
					</AlertDescription>
				</Alert>
			) : null}

			<Card className="max-w-4xl">
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="space-y-1">
							<CardTitle className="font-semibold text-2xl">
								{providerQuery.data?.provider.name ?? "Provider configuration"}
							</CardTitle>
							<CardDescription>
								{providerQuery.data?.provider.description ??
									"Update credentials and connection settings for this provider."}
							</CardDescription>
						</div>
						{status ? (
							<Badge
								variant={isPaused ? "outline" : "secondary"}
								className="capitalize"
							>
								{status}
							</Badge>
						) : null}
					</div>
					<div className="flex flex-wrap gap-3 text-muted-foreground text-sm">
						<span className="flex items-center gap-1">
							<CheckCircle2
								className={cn(
									"size-4",
									providerQuery.data?.imapTestOk
										? "text-emerald-500"
										: "text-muted-foreground",
								)}
							/>
							{providerQuery.data?.imapTestOk
								? "IMAP last test succeeded"
								: "IMAP test pending"}
						</span>
						{providerQuery.data?.lastTestedAt ? (
							<span className="flex items-center gap-1">
								<RefreshCw className="size-4 text-muted-foreground" />
								Last tested {formatDateTime(providerQuery.data.lastTestedAt)}
							</span>
						) : null}
					</div>
				</CardHeader>
				<CardContent>
					{serverError ? (
						<Alert variant="destructive" className="mb-6">
							<AlertCircle className="size-4" />
							<AlertTitle>Unable to save provider</AlertTitle>
							<AlertDescription>{serverError}</AlertDescription>
						</Alert>
					) : null}

					<Form {...form}>
						<form onSubmit={handleSubmit} className="space-y-8" noValidate>
							<section className="grid gap-4">
								<div>
									<h3 className="font-semibold text-lg">General</h3>
									<p className="text-muted-foreground text-sm">
										Name and contact details used when syncing mailboxes.
									</p>
								</div>
								<div className="grid gap-4 md:grid-cols-2">
									<FormField
										control={form.control}
										name="displayName"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Display name</FormLabel>
												<FormControl>
													<Input
														placeholder="Support"
														disabled={disableInputs}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="email"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Notification email</FormLabel>
												<FormControl>
													<Input
														placeholder="support@example.com"
														disabled={disableInputs}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</section>

							<Separator />

							<section className="grid gap-4">
								<div>
									<h3 className="font-semibold text-lg">IMAP settings</h3>
									<p className="text-muted-foreground text-sm">
										Credentials used to read mailboxes from this provider.
									</p>
								</div>
								<div className="grid gap-4 md:grid-cols-2">
									<FormField
										control={form.control}
										name="imap.host"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Host</FormLabel>
												<FormControl>
													<Input
														placeholder="imap.example.com"
														disabled={disableInputs}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="imap.port"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Port</FormLabel>
												<FormControl>
													<Input
														type="number"
														inputMode="numeric"
														min={1}
														disabled={disableInputs}
														value={field.value ?? ""}
														onChange={(event) => {
															const next = event.target.value;
															field.onChange(
																next === "" ? undefined : Number(next),
															);
														}}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormField
									control={form.control}
									name="imap.secure"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel>Use TLS</FormLabel>
												<FormDescription>
													Enable secure connections when communicating with the
													IMAP server.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
													disabled={disableInputs}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								<div className="grid gap-4 md:grid-cols-2">
									<FormField
										control={form.control}
										name="imap.auth.user"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Username</FormLabel>
												<FormControl>
													<Input
														placeholder="user@example.com"
														disabled={disableInputs}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="imap.auth.pass"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Password</FormLabel>
												<FormControl>
													<Input
														type="password"
														autoComplete="new-password"
														disabled={disableInputs}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<Button
									type="button"
									variant="outline"
									className="w-fit"
									onClick={() => testImapMutation.mutate()}
									disabled={
										isLoading ||
										!slug ||
										!providerId ||
										testImapMutation.isPending ||
										saveMutation.isPending
									}
								>
									<RefreshCw className="mr-2 size-4" />
									{testImapMutation.isPending ? "Testing IMAP..." : "Test IMAP"}
								</Button>
							</section>

							<Separator />

							<section className="grid gap-4">
								<div>
									<h3 className="font-semibold text-lg">SMTP settings</h3>
									<p className="text-muted-foreground text-sm">
										Configure the outbound server details used to send emails.
									</p>
								</div>
								<div className="grid gap-4 md:grid-cols-2">
									<FormField
										control={form.control}
										name="smtp.host"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Host</FormLabel>
												<FormControl>
													<Input
														placeholder="smtp.example.com"
														disabled={disableInputs}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="smtp.port"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Port</FormLabel>
												<FormControl>
													<Input
														type="number"
														inputMode="numeric"
														min={1}
														disabled={disableInputs}
														value={field.value ?? ""}
														onChange={(event) => {
															const next = event.target.value;
															field.onChange(
																next === "" ? undefined : Number(next),
															);
														}}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormField
									control={form.control}
									name="smtp.secure"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel>Use TLS</FormLabel>
												<FormDescription>
													Enable secure connections when sending mail via SMTP.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
													disabled={disableInputs}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="smtp.from"
									render={({ field }) => (
										<FormItem>
											<FormLabel>From address</FormLabel>
											<FormDescription>
												Optional email override for outbound messages.
											</FormDescription>
											<FormControl>
												<Input
													placeholder="no-reply@example.com"
													disabled={disableInputs}
													value={field.value ?? ""}
													onChange={(event) =>
														field.onChange(event.target.value)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="grid gap-4 md:grid-cols-2">
									<FormField
										control={form.control}
										name="smtp.auth.user"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Username</FormLabel>
												<FormControl>
													<Input
														placeholder="user@example.com"
														disabled={disableInputs}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="smtp.auth.pass"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Password</FormLabel>
												<FormControl>
													<Input
														type="password"
														autoComplete="new-password"
														disabled={disableInputs}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<Button
									type="button"
									variant="outline"
									className="w-fit"
									onClick={() => testSmtpMutation.mutate()}
									disabled={
										isLoading ||
										!slug ||
										!providerId ||
										testSmtpMutation.isPending ||
										saveMutation.isPending
									}
								>
									<RefreshCw className="mr-2 size-4" />
									{testSmtpMutation.isPending ? "Testing SMTP..." : "Test SMTP"}
								</Button>
							</section>

							<Separator />

							<CardFooter className="flex flex-wrap items-center gap-3 p-0">
								<Button
									type="submit"
									disabled={
										isLoading ||
										!slug ||
										!providerId ||
										saveMutation.isPending ||
										testImapMutation.isPending ||
										testSmtpMutation.isPending
									}
								>
									{saveMutation.isPending ? "Saving..." : "Save"}
								</Button>
								<Button
									type="button"
									variant="secondary"
									onClick={() =>
										isPaused ? resumeMutation.mutate() : pauseMutation.mutate()
									}
									disabled={
										isLoading ||
										!slug ||
										!providerId ||
										pauseMutation.isPending ||
										resumeMutation.isPending ||
										saveMutation.isPending
									}
								>
									{pauseMutation.isPending || resumeMutation.isPending ? (
										"Updating..."
									) : isPaused ? (
										<>
											<Play className="mr-2 size-4" /> Resume
										</>
									) : (
										<>
											<Pause className="mr-2 size-4" /> Pause
										</>
									)}
								</Button>
							</CardFooter>
						</form>
					</Form>
				</CardContent>
			</Card>
		</AppShell>
	);
}
