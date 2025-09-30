import {
	OrganizationsCard,
	RedirectToSignIn,
} from "@daveyplate/better-auth-ui";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";

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
