import {
	BarChart3,
	CalendarDays,
	FlagIcon,
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
		label: "Admin",
		items: [
			{ title: "Dashboard", href: "/admin/overview", icon: LayoutDashboard },
			{ title: "Calendars", href: "/admin/cals", icon: CalendarDays },
			{ title: "Users", href: "/admin/users", icon: Users },
			{ title: "Providers", href: "/admin/providers", icon: Network },
			//Implement the page
			{ title: "Flags", href: "/admin/flags", icon: FlagIcon },
		],
	},
	{
		label: "Activities",
		items: [
			{ title: "Background", href: "/admin/background", icon: ShieldCheck },
			{ title: "Jobs", href: "/admin/background/jobs", icon: BarChart3 },
			{ title: "Logs", href: "/admin/background/logs", icon: MessageSquare },
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
