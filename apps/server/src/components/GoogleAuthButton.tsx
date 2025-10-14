"use client";
import { GoogleIcon } from "@daveyplate/better-auth-ui";
import React, { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { useCallbackSP } from "@/hooks/use-callback-sp";

const providerId = "google";

export const GoogleAuthButton = () => {
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isAuthenticated, setIsAuthenticated] = React.useState<boolean>();
	const isConfigured = Boolean(providerId);

	const { callbackURL } = useCallbackSP();
	useEffect(() => {
		const checkAuthentication = async () => {
			setIsAuthenticated(false);
			const session = await authClient.getSession();
			setIsAuthenticated(!!session?.data?.user);
		};

		checkAuthentication();
	}, []);
	const handleSignIn = React.useCallback(async () => {
		if (!isConfigured || !providerId) {
			setErrorMessage(
				"google auth is not fully configured. Contact an administrator to enable TUKI sign-in.",
			);
			return;
		}

		setErrorMessage(null);
		setIsLoading(true);
		try {
			if (isAuthenticated) {
				const { error } = await authClient.signIn.oauth2({
					providerId,
					callbackURL,
				});
				// const { error } = await authClient.linkSocial({
				// 	provider: "google",
				// 	callbackURL: "/dashboard",
				// });
				if (error) {
					setErrorMessage(
						error.message ||
							"Unable to start single sign-on. Please try again.",
					);
				}
			} else {
				const { error } = await authClient.signIn.oauth2({
					providerId,
					callbackURL,
				});
				if (error) {
					setErrorMessage(
						error.message ||
							"Unable to start single sign-on. Please try again.",
					);
				}
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
		<div>
			<Button
				onClick={handleSignIn}
				disabled={isLoading || isAuthenticated === undefined}
				className="w-full"
			>
				{isLoading ? (
					"Loading..."
				) : (
					<>
						<GoogleIcon />{" "}
						{isAuthenticated ? "Link Google" : "Sign in with Google"}
					</>
				)}
			</Button>
			{(!isConfigured || errorMessage) && (
				<Alert variant="destructive">
					<AlertTitle>Google auth unavailable</AlertTitle>
					<AlertDescription>
						{errorMessage ??
							"Environment variables for the TUKI OAuth client are missing."}
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
};
