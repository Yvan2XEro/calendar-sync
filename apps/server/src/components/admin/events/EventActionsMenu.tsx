"use client";

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { StatusAction } from "./status-actions";

type EventActionsMenuProps = {
	statusActions: StatusAction[];
	onUpdateStatus: (action: StatusAction) => void;
	onEdit: () => void;
	onView: () => void;
	disabled?: boolean;
	onDelete: () => void;
	isDeleting?: boolean;
};

export function EventActionsMenu({
	statusActions,
	onUpdateStatus,
	onEdit,
	onView,
	onDelete,
	isDeleting = false,
	disabled = false,
}: EventActionsMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" disabled={disabled}>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuLabel>Moderation</DropdownMenuLabel>
				{statusActions.map((action) => (
					<DropdownMenuItem
						key={`${action.status}-${
							action.publish === undefined
								? "auto"
								: action.publish
									? "publish"
									: "draft"
						}`}
						onClick={() => onUpdateStatus(action)}
					>
						<div className="flex w-full items-start gap-2">
							<action.icon className="mt-0.5 size-4 shrink-0" />
							<div className="flex flex-col">
								<span>{action.label}</span>
								{action.description ? (
									<span className="text-muted-foreground text-xs">
										{action.description}
									</span>
								) : null}
							</div>
						</div>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onEdit}>Edit event</DropdownMenuItem>
				<DropdownMenuItem onClick={onView}>View details</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={onDelete}
					disabled={isDeleting}
					className="text-destructive focus:text-destructive"
				>
					Delete event
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
