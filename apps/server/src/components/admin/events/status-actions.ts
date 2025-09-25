import { RefreshCcw, UserCheck, UserX } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import type { EventStatus } from "@/app/(site)/admin/events/event-filters";

export type StatusAction = {
	label: string;
	status: EventStatus;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const statusActions: StatusAction[] = [
	{ label: "Validate", status: "approved", icon: UserCheck },
	{ label: "Mark pending", status: "pending", icon: RefreshCcw },
	{ label: "Archive", status: "rejected", icon: UserX },
];
