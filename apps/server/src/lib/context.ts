import { auth, enforceTukiSessionRoles } from "./auth";

export async function createContext(req: Request) {
	const session = await auth.api.getSession({
		headers: req.headers,
	});
	const normalized = await enforceTukiSessionRoles(session);
	return {
		session: normalized.session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
