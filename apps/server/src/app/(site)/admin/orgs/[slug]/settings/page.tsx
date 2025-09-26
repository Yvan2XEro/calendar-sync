import { CalendarProvidersCard } from "@/components/admin/CalendarProvidersCard";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import {
	OrganizationMembersCard,
	OrganizationSettingsCards,
	RedirectToSignIn,
} from "@daveyplate/better-auth-ui";

type SettingsPageParams = Promise<{ slug: string }>;

export default async function Page({ params }: { params: SettingsPageParams }) {
	const { slug } = await params;

	return (
		<AppShell
			breadcrumbs={[
				{ label: "Admin", href: "/admin/overview" },
				{ label: "Calendars", href: "/admin/orgs" },
				{ label: slug, href: `/admin/orgs/${slug}/settings`, current: true },
			]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />
			<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
				<OrganizationSettingsCards slug={slug} />
				<div className="space-y-6 md:col-span-2">
					<CalendarProvidersCard slug={slug} />
					<OrganizationMembersCard slug={slug} />
				</div>
			</div>
		</AppShell>
	);
}
