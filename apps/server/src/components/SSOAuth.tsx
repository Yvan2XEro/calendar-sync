"use client";
import { usePathname } from "next/navigation";
import React from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

export const SSOAuth = () => {
	const pathname = usePathname();
	const showSso = pathname === "/auth/sign-in" || pathname === "/auth/sign-up";
	if (!showSso) {
		return null;
	}
	return (
		<div className="space-y-4">
			<Button
				onClick={async () => {
					const { data, error } = await authClient.signIn.oauth2({
						providerId: process.env.NEXT_PUBLIC_OIDC_PROVIDER_ID!,
						callbackURL: "/",
					});
				}}
				variant="outline"
				className="mt-3 w-full"
			>
				Continue with TUKI SSO
			</Button>
			<Separator />
		</div>
	);
};
