"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { getUserRoles } from "@/lib/session";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();
	const [isAuthorized, setIsAuthorized] = React.useState(false);
	const [hasChecked, setHasChecked] = React.useState(false);

	React.useEffect(() => {
		if (isPending) return;

		setHasChecked(true);
		if (!session) {
			router.replace("/auth/sign-in");
			return;
		}

		const roles = getUserRoles(session);

		if (!roles.includes("admin")) {
			toast.error("Administrator access required");
			router.replace("/dashboard");
			return;
		}

		setIsAuthorized(true);
	}, [isPending, router, session]);

	if (!hasChecked || isPending) {
		return (
			<div className="flex w-full justify-center py-16 text-muted-foreground">
				<Loader2
					className="size-5 animate-spin"
					aria-label="Checking permissions"
				/>
			</div>
		);
	}

	if (!isAuthorized) {
		return null;
	}

	return <>{children}</>;
}
