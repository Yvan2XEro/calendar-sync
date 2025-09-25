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
	const headerList = await headers();
	const session = await auth.api.getSession({
		headers: headerList,
	});

	if (!session) {
		redirect("/auth/sign-in");
	}

	const userRole = (
		session.user as typeof session.user & {
			role?: string | null;
		}
	)?.role;
	const roles = userRole ? [userRole] : [];

	if (!roles.includes("admin")) {
		redirect("/");
	}

	return <RequireAdmin>{children}</RequireAdmin>;
}
