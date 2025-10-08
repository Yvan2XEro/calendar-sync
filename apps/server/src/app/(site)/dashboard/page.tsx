import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignedInHome } from "@/components/dashboard/SignedInHome";
import type { SessionLike } from "@/lib/session";

function assertSessionData(session: SessionLike): asserts session is {
	user: { id: string } & Record<string, unknown>;
} & Record<string, unknown> {
	if (!session || typeof session !== "object") {
		throw redirect("/auth/sign-in");
	}
	const user = (session as Record<string, unknown>).user;
	if (!user || typeof user !== "object" || typeof (user as { id?: unknown }).id !== "string") {
		throw redirect("/auth/sign-in");
	}
}
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

	assertSessionData(normalized.session);

	return <SignedInHome session={normalized.session} />;
}
