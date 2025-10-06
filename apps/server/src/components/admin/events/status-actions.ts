import { FileCheck, RefreshCcw, UserCheck, UserX } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import type { EventStatus } from "@/app/(site)/admin/events/event-filters";

export type StatusAction = {
	label: string;
	status: EventStatus;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	publish?: boolean;
	description?: string;
};

export const statusActions: StatusAction[] = [
	{
		label: "Approve & publish",
		status: "approved",
		publish: true,
		icon: UserCheck,
		description: "Queues sync + digest jobs for downstream channels.",
	},
	{
		label: "Approve (keep draft)",
		status: "approved",
		publish: false,
		icon: FileCheck,
		description: "Approve while leaving the event unpublished.",
	},
	{
		label: "Mark pending",
		status: "pending",
		icon: RefreshCcw,
		publish: false,
	},
	{ label: "Archive", status: "rejected", icon: UserX, publish: false },
];
