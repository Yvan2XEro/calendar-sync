import {
	OrganizationsCard,
	RedirectToSignIn,
	UserAvatar,
} from "@daveyplate/better-auth-ui";
import React from "react";
import AppShell from "@/components/layout/AppShell";

export default function page() {
	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{ label: "Calendars", current: true },
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />
			<OrganizationsCard />
		</AppShell>
	);
}
