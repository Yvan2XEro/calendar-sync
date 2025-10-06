import { AuthView } from "@daveyplate/better-auth-ui";
import { authViewPaths } from "@daveyplate/better-auth-ui/server";
import Link from "next/link";

import { SSOAuth } from "@/components/SSOAuth";

export const dynamicParams = false;

export function generateStaticParams() {
	return Object.values(authViewPaths).map((path) => ({ path }));
}

const ssoCopy = new Map<string, { title: string; description: string }>([
	[
		authViewPaths.SIGN_IN,
		{
			title: "Sign in with TUKI",
			description:
				"CalendarSync now requires TUKI single sign-on. Continue with your organization credentials to access the dashboard.",
		},
	],
	[
		authViewPaths.SIGN_UP,
		{
			title: "Create your CalendarSync account",
			description:
				"New accounts are provisioned through TUKI. Use the button below to complete enrollment with your workspace administrator.",
		},
	],
	[
		authViewPaths.FORGOT_PASSWORD,
		{
			title: "Password resets disabled",
			description:
				"Password-based access has been replaced with TUKI single sign-on. Return to your sign-in flow below.",
		},
	],
	[
		authViewPaths.RESET_PASSWORD,
		{
			title: "Use TUKI to manage access",
			description:
				"CalendarSync no longer manages passwords directly. Authenticate through TUKI to regain access to your account.",
		},
	],
	[
		authViewPaths.RECOVER_ACCOUNT,
		{
			title: "Recover access with TUKI",
			description:
				"Account recovery is handled by your TUKI identity provider. Continue with single sign-on to get started.",
		},
	],
	[
		authViewPaths.EMAIL_OTP,
		{
			title: "Magic links unavailable",
			description:
				"Email-based login has been disabled. Use TUKI single sign-on for secure access to CalendarSync.",
		},
	],
	[
		authViewPaths.MAGIC_LINK,
		{
			title: "Use TUKI single sign-on",
			description:
				"We now rely exclusively on TUKI SSO. Launch the sign-in flow below to continue.",
		},
	],
]);

export default async function AuthPage({
	params,
}: {
	params: Promise<{ path: string }>;
}) {
	const { path } = await params;

	if (ssoCopy.has(path)) {
		const copy = ssoCopy.get(path)!;
		return (
			<main className="hero-gradient container flex grow flex-col items-center justify-center self-center p-4 md:p-6">
				<div className="w-full max-w-md space-y-6 rounded-xl border bg-background p-6 text-center shadow-lg">
					<Link className="block font-bold text-2xl" href="/">
						CalendarSync
					</Link>
					<div className="space-y-3">
						<h1 className="font-semibold text-xl">{copy.title}</h1>
						<p className="text-muted-foreground text-sm">{copy.description}</p>
						<SSOAuth />
					</div>
				</div>
			</main>
		);
	}

	return (
		<main className="hero-gradient container flex grow flex-col items-center justify-center self-center p-4 md:p-6">
			<AuthView
				path={path}
				callbackURL="/admin/overview"
				cardHeader={
					<>
						<Link className="font-bold text-2xl" href="/">
							CalendarSync
						</Link>
						<SSOAuth />
					</>
				}
			/>
		</main>
	);
}
