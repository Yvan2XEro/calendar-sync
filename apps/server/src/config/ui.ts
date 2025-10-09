import {
	Building2,
	FlagIcon,
	LayoutDashboard,
	ListTodo,
	Mail,
	MessageSquare,
	Network,
	Ticket,
	Users,
} from "lucide-react";
import type { NavGroup } from "@/components/layout/AppShell";

export const defaultNavigation: NavGroup[] = [
	{
		label: "Admin",
		items: [
			{ title: "Dashboard", href: "/admin/overview", icon: LayoutDashboard },
			{ title: "Organizations", href: "/admin/orgs", icon: Building2 },
			{ title: "Users", href: "/admin/users", icon: Users },
			{ title: "Providers", href: "/admin/providers", icon: Network },
			{ title: "Flags", href: "/admin/flags", icon: FlagIcon },
			{ title: "Email digests", href: "/admin/digests", icon: Mail },
			{ title: "Ticket types", href: "/admin/ticket-types", icon: Ticket },
		],
	},
	{
		label: "Activities",
		items: [
			{ title: "Logs", href: "/admin/logs", icon: MessageSquare },
			{ title: "Events queue", href: "/admin/events", icon: ListTodo },
		],
	},
];

export const highlights = [
	{
		title: "Instant access",
		description:
			"Connect Better Auth and sign in with a single click using the secure hosted flow.",
	},
	{
		title: "Team visibility",
		description:
			"Invite teammates, manage roles, and keep your workspace in sync in seconds.",
	},
	{
		title: "Real-time insights",
		description:
			"Track adoption and engagement with actionable analytics surfaced in real time.",
	},
];
