"use client";

import { RedirectToSignIn } from "@daveyplate/better-auth-ui";
import { Building2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import AppShell from "@/components/layout/AppShell";
import { OrganizationsOverview } from "@/components/organizations/OrganizationsOverview";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function OrganizationsPage() {
	return (
		<AppShell
			breadcrumbs={[
				{ label: "Dashboard", href: "/dashboard" },
				{ label: "Organizations", current: true },
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />

			<section className="space-y-6">
				<Card className="space-y-3 rounded-3xl border-none bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 text-foreground shadow-sm">
					<div className="flex flex-col gap-2">
						<p className="text-muted-foreground text-sm">Workspace directory</p>
						<h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
							Explore your organizations
						</h1>
						<p className="max-w-2xl text-muted-foreground text-sm">
							Review the teams you belong to and discover new ones tailored to
							your interests. Join in a click and keep your calendar aligned.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
						<span className="inline-flex items-center gap-2">
							<Building2 className="size-4" aria-hidden />
							Manage memberships and find new collaborators
						</span>
						<Button variant="ghost" className="h-auto px-0 text-xs" asChild>
							<Link href="/account/settings">Adjust notification settings</Link>
						</Button>
					</div>
				</Card>
			</section>

			<OrganizationsOverview
				title="Organizations"
				description="Search, filter, and join workspaces that matter to you."
				className="mt-6"
			/>
		</AppShell>
	);
}
