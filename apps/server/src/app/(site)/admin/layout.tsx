import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type React from "react";

import { RequireAdmin } from "@/components/admin/RequireAdmin";
import { auth } from "@/lib/auth";

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: headers(),
	});

	if (!session) {
		redirect("/auth/sign-in");
	}

	const roles = Array.isArray(session.user?.roles)
		? session.user.roles
		: session.user?.role
			? [session.user.role]
			: [];

	if (!roles?.includes("admin")) {
		redirect("/");
	}

	return <RequireAdmin>{children}</RequireAdmin>;
}
