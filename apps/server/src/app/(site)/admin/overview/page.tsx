"use client";

import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { highlights } from "@/config/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RedirectToSignIn, UserAvatar } from "@daveyplate/better-auth-ui";

export default function HomePage() {
  return (
    <AppShell
      breadcrumbs={[
        { label: "Admin", href: "/admin/overview" },
        { label: "Overview", current: true },
      ]}
      headerRight={<UserAvatar />}
    >
      <RedirectToSignIn />
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-gradient-to-br from-primary/15 via-background to-background">
          <CardHeader>
            <Badge variant="secondary" className="w-fit text-xs uppercase">
              Powered by Better Auth
            </Badge>
            <CardTitle className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Welcome to your calendar operations hub
            </CardTitle>
            <CardDescription className="max-w-xl text-base text-muted-foreground">
              Manage users, monitor integrations, and keep every event in sync
              across your organization with a single secure dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Button asChild size="lg">
              <Link href="/auth/sign-in" className="font-semibold">
                Launch the console
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="#highlights">Explore features</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Live workspace status</CardTitle>
            <CardDescription>
              Authentication and synchronization events refresh automatically
              through tRPC powered subscriptions.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Active connections
              </span>
              <span className="text-2xl font-semibold text-foreground">28</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Verified organizations
              </span>
              <span className="text-2xl font-semibold text-foreground">12</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Sync success rate
              </span>
              <span className="text-2xl font-semibold text-foreground">
                99.2%
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="highlights" className="grid gap-6 lg:grid-cols-3">
        {highlights.map((h) => (
          <Card key={h.title}>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">{h.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{h.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 rounded-xl border bg-card/60 p-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Ready when you are
          </h2>
          <p className="text-sm text-muted-foreground">
            Sign in to access the complete admin dashboard, manage accounts, and
            trigger secure calendar synchronizations.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/auth/sign-in">Sign in to continue</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="mailto:team@calendarsync.app">Contact support</Link>
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
