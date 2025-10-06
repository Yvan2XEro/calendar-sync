import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignedInHome } from "@/components/dashboard/SignedInHome";
import { auth, enforceTukiSessionRoles } from "@/lib/auth";

export default async function DashboardPage() {
	const headerList = await headers();
	const sessionResponse = await auth.api.getSession({
		headers: headerList,
	});
	const normalized = await enforceTukiSessionRoles(sessionResponse);

	if (!normalized.session) {
		redirect("/auth/sign-in");
	}

	return <SignedInHome session={normalized.session} />;
}
