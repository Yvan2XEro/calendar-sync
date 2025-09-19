"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { formatDistanceToNow } from "date-fns";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";

import AppShell from "@/components/layout/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import {
  useCatalogProvider,
  useTestCatalogImap,
  useTestCatalogSmtp,
  useUpsertCatalogProvider,
} from "@/hooks/use-provider-admin";
import { UserAvatar } from "@/components/UserAvatar";

const providerStatuses = ["draft", "beta", "active", "deprecated"] as const;
const providerCategories = [
  { label: "Email", value: "email" },
  { label: "Google", value: "google" },
] as const;

type ProviderFormValues = {
  id?: string;
  category: string;
  name: string;
  description: string;
  status: (typeof providerStatuses)[number];
  displayName: string;
  email: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpFrom: string;
  smtpUser: string;
  smtpPass: string;
};

const emptyFormValues: ProviderFormValues = {
  category: "",
  name: "",
  description: "",
  status: "draft",
  displayName: "",
  email: "",
  imapHost: "",
  imapPort: "993",
  imapSecure: true,
  imapUser: "",
  imapPass: "",
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: true,
  smtpFrom: "",
  smtpUser: "",
  smtpPass: "",
};

function sanitizeSecret(value: unknown) {
  if (typeof value !== "string") return "";
  if (value.trim() === "••••••") return "";
  return value;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asPortString(value: unknown, fallback: string) {
  if (typeof value === "number") return value.toString();
  if (typeof value === "string" && value.trim().length > 0) return value;
  return fallback;
}

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const providerIdParam = params?.providerId;
  const providerId = Array.isArray(providerIdParam)
    ? providerIdParam[0]
    : providerIdParam;
  const isNew = !providerId || providerId === "new";

  const detailQuery = useCatalogProvider(isNew ? undefined : providerId);
  const upsertMutation = useUpsertCatalogProvider();
  const imapTestMutation = useTestCatalogImap();
  const smtpTestMutation = useTestCatalogSmtp();

  const form = useForm<ProviderFormValues>({
    defaultValues: emptyFormValues,
  });

  const [imapTestPassed, setImapTestPassed] = React.useState(false);

  React.useEffect(() => {
    const subscription = form.watch(() => {
      setImapTestPassed((prev) => (prev ? false : prev));
    });
    return () => subscription.unsubscribe();
  }, [form]);

  React.useEffect(() => {
    if (isNew) {
      form.reset(emptyFormValues);
      setImapTestPassed(false);
      return;
    }

    if (!detailQuery.data) return;

    const detail = detailQuery.data;
    const config = (detail.config ?? {}) as Record<string, unknown>;
    const imap = (config.imap ?? {}) as Record<string, unknown>;
    const imapAuth = (imap.auth ?? {}) as Record<string, unknown>;
    const smtp = (config.smtp ?? {}) as Record<string, unknown>;
    const smtpAuth = (smtp.auth ?? {}) as Record<string, unknown>;

    form.reset({
      id: detail.id,
      category: detail.category,
      name: detail.name,
      description: detail.description ?? "",
      status: (detail.status as ProviderFormValues["status"]) ?? "draft",
      displayName: asString(config.displayName, ""),
      email: asString(config.email, ""),
      imapHost: asString(imap.host, ""),
      imapPort: asPortString(imap.port, "993"),
      imapSecure: asBoolean(imap.secure, true),
      imapUser: asString(imapAuth.user, ""),
      imapPass: sanitizeSecret(imapAuth.pass),
      smtpHost: asString(smtp.host, ""),
      smtpPort: asPortString(smtp.port, "587"),
      smtpSecure: asBoolean(smtp.secure, true),
      smtpFrom: asString(smtp.from, ""),
      smtpUser: asString(smtpAuth.user, ""),
      smtpPass: sanitizeSecret(smtpAuth.pass),
    });
    setImapTestPassed(false);
  }, [detailQuery.data, form, isNew]);

  const detail = detailQuery.data;

  const title = isNew ? "New provider" : (detail?.name ?? "Provider");

  const configFromValues = React.useCallback((values: ProviderFormValues) => {
    const parsePort = (value: string, fallback: number) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? fallback : parsed;
    };

    return {
      displayName: values.displayName,
      email: values.email,
      imap: {
        host: values.imapHost,
        port: parsePort(values.imapPort, 993),
        secure: values.imapSecure,
        auth: {
          user: values.imapUser,
          pass: values.imapPass,
        },
      },
      smtp: {
        host: values.smtpHost,
        port: parsePort(values.smtpPort, 587),
        secure: values.smtpSecure,
        from: values.smtpFrom ? values.smtpFrom : undefined,
        auth: {
          user: values.smtpUser,
          pass: values.smtpPass,
        },
      },
    };
  }, []);

  const handleTestImap = React.useCallback(async () => {
    const valid = await form.trigger();
    if (!valid) return;

    const values = form.getValues();
    try {
      await imapTestMutation.mutateAsync({
        providerId: isNew ? undefined : providerId,
        config: configFromValues(values),
      });
      setImapTestPassed(true);
    } catch (error) {
      console.error(error);
    }
  }, [configFromValues, form, imapTestMutation, isNew, providerId]);

  const handleTestSmtp = React.useCallback(async () => {
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    try {
      await smtpTestMutation.mutateAsync({
        providerId: isNew ? undefined : providerId,
        config: configFromValues(values),
      });
    } catch (error) {
      console.error(error);
    }
  }, [configFromValues, form, isNew, providerId, smtpTestMutation]);

  const onSubmit = form.handleSubmit((values) => {
    const payload = {
      id: isNew ? undefined : providerId,
      category: values.category,
      name: values.name,
      description:
        values.description.trim().length > 0 ? values.description : null,
      status: values.status,
      config: configFromValues(values),
    } as const;

    upsertMutation.mutate(payload);
  });

  const isLoading = !isNew && detailQuery.isLoading;
  const loadError = detailQuery.isError;

  const lastTestedLabel = detail?.lastTestedAt
    ? formatDistanceToNow(new Date(detail.lastTestedAt), { addSuffix: true })
    : "Never";

  const disableSave =
    // !imapTestPassed ||
    imapTestMutation.isPending ||
    smtpTestMutation.isPending ||
    upsertMutation.isPending;

  return (
    <AppShell
      breadcrumbs={[
        { label: "Admin", href: "/admin/overview" },
        { label: "Providers", href: "/admin/providers" },
        { label: title, current: true },
      ]}
      headerRight={<UserAvatar />}
    >
      <RedirectToSignIn />
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                {isNew
                  ? "Create a provider configuration that can be linked to calendars."
                  : "Update the provider details and credentials."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadError ? (
                <Alert variant="destructive">
                  <AlertTitle>Unable to load provider</AlertTitle>
                  <AlertDescription>
                    {detailQuery.error instanceof Error
                      ? detailQuery.error.message
                      : "Something went wrong while fetching the provider."}
                  </AlertDescription>
                </Alert>
              ) : isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-64" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="category"
                    rules={{ required: "Category is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {providerCategories.map((category) => (
                              <SelectItem
                                key={category.value}
                                value={category.value}
                              >
                                {category.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    rules={{ required: "Name is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Generic IMAP" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    rules={{ required: "Status is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {providerStatuses.map((status) => (
                              <SelectItem
                                key={status}
                                value={status}
                                className="capitalize"
                              >
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <textarea
                            {...field}
                            rows={4}
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Describe this provider"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connection settings</CardTitle>
              <CardDescription>
                Provide the credentials used to test and connect.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="displayName"
                  rules={{ required: "Display name is required" }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display name</FormLabel>
                      <FormControl>
                        <Input placeholder="Calendar Sync" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  rules={{ required: "Email is required" }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="team@example.com"
                          type="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground text-sm">
                    IMAP
                  </h3>
                  <span className="text-muted-foreground text-xs">
                    Last tested: {lastTestedLabel}
                  </span>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="imapHost"
                    rules={{ required: "IMAP host is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host</FormLabel>
                        <FormControl>
                          <Input placeholder="imap.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="imapPort"
                    rules={{ required: "IMAP port is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input placeholder="993" type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="imapSecure"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Use SSL/TLS</FormLabel>
                          <FormMessage />
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="imapUser"
                      rules={{ required: "IMAP username is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input placeholder="imap-user" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="imapPass"
                      rules={{ required: "IMAP password is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-foreground text-sm">SMTP</h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="smtpHost"
                    rules={{ required: "SMTP host is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="smtpPort"
                    rules={{ required: "SMTP port is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input placeholder="587" type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="smtpSecure"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Use STARTTLS</FormLabel>
                          <FormMessage />
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="smtpFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="notifications@example.com"
                            type="email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="smtpUser"
                    rules={{ required: "SMTP username is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp-user" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="smtpPass"
                    rules={{ required: "SMTP password is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Enter password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestImap}
                  disabled={
                    imapTestMutation.isPending ||
                    smtpTestMutation.isPending ||
                    upsertMutation.isPending
                  }
                  aria-busy={imapTestMutation.isPending}
                >
                  Test IMAP
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestSmtp}
                  disabled={
                    smtpTestMutation.isPending || upsertMutation.isPending
                  }
                  aria-busy={smtpTestMutation.isPending}
                >
                  Test SMTP
                </Button>
                {!imapTestPassed ? (
                  <span className="text-muted-foreground text-xs">
                    Run an IMAP test to enable saving.
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/admin/providers")}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={disableSave}
                  aria-busy={upsertMutation.isPending}
                >
                  Save provider
                </Button>
              </div>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </AppShell>
  );
}
