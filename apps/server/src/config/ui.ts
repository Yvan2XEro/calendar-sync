import {
	BarChart3,
	CalendarDays,
	LayoutDashboard,
	MessageSquare,
	Network,
	Settings,
	ShieldCheck,
	Users,
} from "lucide-react";
import type { NavGroup } from "@/components/layout/AppShell";

export const defaultNavigation: NavGroup[] = [
	{
		label: "Workspace",
		items: [
			{ title: "Dashboard", href: "/admin/overview", icon: LayoutDashboard },
			{ title: "Calendar", href: "/admin/cals", icon: CalendarDays },
			{ title: "Messages", href: "#messages", icon: MessageSquare },
		],
	},
	{
		label: "Admin",
		items: [
                        { title: "Users", href: "/admin/users", icon: Users },
			{ title: "Providers", href: "/admin/providers", icon: Network },
			{ title: "Security", href: "#security", icon: ShieldCheck },
			{ title: "Reports", href: "#reports", icon: BarChart3 },
			{ title: "Settings", href: "#settings", icon: Settings },
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
