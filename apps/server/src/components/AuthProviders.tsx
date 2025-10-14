"use client";
import { AccountsCard, useAuthData } from "@daveyplate/better-auth-ui";
import React from "react";
import { authClient } from "@/lib/auth-client";

export const AuthProviders = () => {
	const { data: accounts } = useAuthData({
		queryFn: authClient.listAccounts,
		cacheKey: "listAccounts",
	});
	console.log({ accounts });

	return (
		<div>
			<p>Hi</p>
			<AccountsCard />
		</div>
	);
};
