import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type React from "react";

import { RequireAdmin } from "@/components/admin/RequireAdmin";
import { auth, enforceTukiSessionRoles } from "@/lib/auth";
import { getUserRoles } from "@/lib/session";

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const headerList = await headers();
	const session = await auth.api.getSession({
		headers: headerList,
	});
	const normalized = await enforceTukiSessionRoles(session);

	if (!normalized.session) {
		redirect("/auth/sign-in");
	}

	const roles = getUserRoles(normalized.session);

	if (!roles.includes("admin")) {
		redirect("/");
	}

	return <RequireAdmin>{children}</RequireAdmin>;
}
