import { AuthView } from "@daveyplate/better-auth-ui";
import { authViewPaths } from "@daveyplate/better-auth-ui/server";
import Link from "next/link";
import { SSOAuth } from "@/components/SSOAuth";

export const dynamicParams = false;

export function generateStaticParams() {
	return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
	params,
}: {
	params: Promise<{ path: string }>;
}) {
	const { path } = await params;

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
