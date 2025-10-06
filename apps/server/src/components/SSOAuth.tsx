"use client";

import React from "react";

import { authClient } from "@/lib/auth-client";

import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";

const providerId = process.env.NEXT_PUBLIC_OIDC_PROVIDER_ID?.trim();

export const SSOAuth = () => {
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [isLoading, setIsLoading] = React.useState(false);
	const isConfigured = Boolean(providerId);

	const handleSignIn = React.useCallback(async () => {
		if (!isConfigured || !providerId) {
			setErrorMessage(
				"Single sign-on is not fully configured. Contact an administrator to enable TUKI sign-in.",
			);
			return;
		}

		setErrorMessage(null);
		setIsLoading(true);
		try {
			const { error } = await authClient.signIn.oauth2({
				providerId,
				callbackURL: "/",
			});
			if (error) {
				setErrorMessage(
					error.message || "Unable to start single sign-on. Please try again.",
				);
			}
		} catch (err) {
			setErrorMessage(
				err instanceof Error
					? err.message
					: "We couldn't start single sign-on. Please try again or reach out to your administrator.",
			);
		} finally {
			setIsLoading(false);
		}
	}, [isConfigured, providerId]);

	return (
		<div className="space-y-4">
			<Button
				onClick={handleSignIn}
				variant="outline"
				disabled={!isConfigured || isLoading}
				className="w-full"
			>
				{isLoading ? "Redirecting to TUKI…" : "Continue with TUKI SSO"}
			</Button>
			{(!isConfigured || errorMessage) && (
				<Alert variant="destructive">
					<AlertTitle>Single sign-on unavailable</AlertTitle>
					<AlertDescription>
						{errorMessage ??
							"Environment variables for the TUKI OAuth client are missing."}
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
};
