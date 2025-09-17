"use client";

import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigation = [
  {
    label: "Workspace",
    items: [
      {
        title: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
      },
      {
        title: "Calendar",
        href: "#calendar",
        icon: CalendarDays,
      },
      {
        title: "Messages",
        href: "#messages",
        icon: MessageSquare,
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        title: "Users",
        href: "#users",
        icon: Users,
      },
      {
        title: "Security",
        href: "#security",
        icon: ShieldCheck,
      },
      {
        title: "Reports",
        href: "#reports",
        icon: BarChart3,
      },
      {
        title: "Settings",
        href: "#settings",
        icon: Settings,
      },
    ],
  },
];

const highlights = [
  {
    title: "Instant access",
    description:
      "Connect Better Auth and sign in with a single click using the secure hosted flow.",
  },
  {
    title: "Team visibility",
    description:
      "Invite teammates, manage roles, and keep your workspace in sync in seconds.",
  },
  {
    title: "Real-time insights",
    description:
      "Track adoption and engagement with actionable analytics surfaced in real time.",
  },
];

export default function Home() {
  return (
    <SidebarProvider>
      <div className="bg-muted/30 flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader className="gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                calendar sync
              </p>
              <p className="text-lg font-semibold text-sidebar-foreground">
                Admin Console
              </p>
            </div>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            {navigation.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={item.href === "/"}>
                          <Link href={item.href} className="flex items-center gap-2">
                            <item.icon className="size-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <div className="rounded-lg border border-dashed p-3 text-xs text-sidebar-foreground/80">
              Secure authentication powered by Better Auth.
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="border-b bg-background/80 sticky top-0 z-10 flex h-16 items-center gap-4 px-6 backdrop-blur">
            <SidebarTrigger className="md:hidden" />
            <div className="flex flex-1 items-center justify-between gap-4">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/">Admin</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Overview</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <Button asChild variant="default" size="sm">
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-8 px-6 py-10">
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
                    Manage users, monitor integrations, and keep every event in sync across your organization with a single secure
                    dashboard.
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
                    Authentication and synchronization events refresh automatically through tRPC powered subscriptions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Active connections</span>
                    <span className="text-2xl font-semibold text-foreground">28</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Verified organizations</span>
                    <span className="text-2xl font-semibold text-foreground">12</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Sync success rate</span>
                    <span className="text-2xl font-semibold text-foreground">99.2%</span>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section id="highlights" className="grid gap-6 lg:grid-cols-3">
              {highlights.map((highlight) => (
                <Card key={highlight.title}>
                  <CardHeader>
                    <CardTitle className="text-xl font-semibold">
                      {highlight.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{highlight.description}</p>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className="grid gap-4 rounded-xl border bg-card/60 p-6">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Ready when you are</h2>
                <p className="text-sm text-muted-foreground">
                  Sign in to access the complete admin dashboard, manage accounts, and trigger secure calendar synchronizations.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/auth/sign-in">
                    Sign in to continue
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="mailto:team@calendarsync.app">Contact support</Link>
                </Button>
              </div>
            </section>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
