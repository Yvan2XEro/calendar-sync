"use client";

import { OrganizationSwitcher } from "@daveyplate/better-auth-ui";
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
						{navigation.map((group) => (
							<SidebarGroup key={group.label}>
								<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
								<SidebarGroupContent>
									<SidebarMenu>
										{group.items.map((item) => (
											<SidebarMenuItem key={item.title}>
												<SidebarMenuButton
													asChild
													isActive={pathname.startsWith(item.href)}
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
