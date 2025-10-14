import {
	AccountSettingsCards,
	AccountsCard,
	ProvidersCard,
	RedirectToSignIn,
	SecuritySettingsCards,
	socialProviders,
} from "@daveyplate/better-auth-ui";
import { accountViewPaths } from "@daveyplate/better-auth-ui/server";
import AppShell from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/UserAvatar";

export const dynamicParams = false;

export function generateStaticParams() {
	return Object.values(accountViewPaths).map((path) => ({ path }));
}

export default async function AccountPage() {
	return (
		<AppShell
			breadcrumbs={[{ label: "Account", current: true }]}
			headerRight={<UserAvatar />}
		>
			<RedirectToSignIn />
			<AccountSettingsCards className="grid grid-cols-1 gap-6 md:grid-cols-2" />
			<SecuritySettingsCards className="grid grid-cols-1 gap-6 md:grid-cols-2 [&>*:first-child]:col-span-2" />

			{/* <AccountsCard /> */}
		</AppShell>
	);
}
