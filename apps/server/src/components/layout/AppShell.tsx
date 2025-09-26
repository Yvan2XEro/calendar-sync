"use client";

import { OrganizationSwitcher } from "@daveyplate/better-auth-ui";
import { Building2, CalendarDays, LayoutDashboard, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import {
        Breadcrumb,
        BreadcrumbItem,
        BreadcrumbLink,
        BreadcrumbList,
        BreadcrumbPage,
        BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { defaultNavigation } from "@/config/ui";
import { authClient } from "@/lib/auth-client";
import { getUserRoles } from "@/lib/session";
import { HeaderNavWrapper } from "./HeaderNavWrapper";

export type NavItem = {
  title: string;
  href: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type Crumb = { label: string; href?: string; current?: boolean };

const WORKSPACE_ITEMS: NavItem[] = [
  { title: "Overview", href: "/", icon: LayoutDashboard },
  { title: "Events", href: "/events", icon: CalendarDays },
  { title: "Organizations", href: "/organizations", icon: Building2 },
  { title: "Account settings", href: "/account/settings", icon: Settings },
];

function mergeNavigation(
  baseGroups: NavGroup[],
  workspaceItems: NavItem[]
): NavGroup[] {
  const seen = new Set<string>();
  const dedupe = (items: NavItem[]) =>
    items.filter((item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    });

  const merged: NavGroup[] = [
    {
      label: "Workspace",
      items: dedupe([...workspaceItems]),
    },
  ];

  for (const group of baseGroups) {
    const filteredItems = dedupe([...group.items]);
    if (filteredItems.length > 0) {
      merged.push({ ...group, items: filteredItems });
    }
  }

  return merged;
}

export default function AppShell({
  appName = "calendar sync",
  consoleName = "Admin Console",
  navigation = defaultNavigation,
  breadcrumbs = [
    { label: "Admin", href: "/" },
    { label: "Overview", current: true },
  ],
  headerRight,
  children,
}: {
  appName?: string;
  consoleName?: string;
  navigation?: NavGroup[];
  breadcrumbs?: Crumb[];
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const roles = React.useMemo(() => getUserRoles(session), [session]);
  const isAdmin = roles.includes("admin");

  const baseNavigation = navigation ?? defaultNavigation;

  const navigationWithWorkspace = React.useMemo(
    () => mergeNavigation(baseNavigation, WORKSPACE_ITEMS),
    [baseNavigation]
  );

  const filteredNavigation = React.useMemo(() => {
    if (isAdmin) {
      return navigationWithWorkspace;
    }

    return navigationWithWorkspace
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.href.startsWith("/admin")),
      }))
      .filter((group) => group.items.length > 0);
  }, [isAdmin, navigationWithWorkspace]);

  const navigationToRender = filteredNavigation.length
    ? filteredNavigation
    : navigationWithWorkspace;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/30">
        <Sidebar>
          <SidebarHeader className="gap-3">
            <div>
              <p className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                {appName}
              </p>
              <p className="font-semibold text-lg text-sidebar-foreground">
                {consoleName}
              </p>
            </div>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            {navigationToRender.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={
                            (item.href === pathname && pathname === "/") ||
                            (pathname.startsWith(item.href) &&
                              item.href !== "/")
                          }
                        >
                          <Link
                            href={item.href as any}
                            className="flex items-center gap-2"
                          >
                            {item.icon ? (
                              <item.icon className="size-4" />
                            ) : null}
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
            <OrganizationSwitcher className="bg-primary-foreground text-accent-primary hover:bg-accent-primary-foreground/80 hover:text-primary" />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <HeaderNavWrapper>
            <SidebarTrigger className="md:hidden" />
            <div className="flex flex-1 items-center justify-between gap-4">
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((c, idx) => (
                    <React.Fragment key={idx}>
                      <BreadcrumbItem>
                        {c.current ? (
                          <BreadcrumbPage>{c.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link href={c.href || ("#" as any)}>{c.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {idx < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>

              <div className="flex items-center gap-2">{headerRight}</div>
            </div>
          </HeaderNavWrapper>

          <main className="flex flex-1 flex-col gap-8 px-6 py-10">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
