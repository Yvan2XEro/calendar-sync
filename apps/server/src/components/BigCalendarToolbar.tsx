import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Navigate, type ToolbarProps, Views } from "react-big-calendar";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const BigCalendarToolbar = ({
	date,
	view,
	views,
	onNavigate,
	onView,
}: ToolbarProps) => {
	const availableViews = (
		Array.isArray(views) && views.length > 0 ? views : Object.values(Views)
	) as string[];
	const currentView = view ?? Views.MONTH;

	return (
		<div className="flex flex-col gap-3 border-border/60 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={() => onNavigate?.(Navigate.PREVIOUS)}
					aria-label="Go to previous period"
					className="rounded-full shadow-sm"
				>
					<ChevronLeft className="size-4" aria-hidden />
				</Button>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onClick={() => onNavigate?.(Navigate.TODAY)}
					className="rounded-full shadow-sm"
				>
					Today
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={() => onNavigate?.(Navigate.NEXT)}
					aria-label="Go to next period"
					className="rounded-full shadow-sm"
				>
					<ChevronRight className="size-4" aria-hidden />
				</Button>
			</div>

			<div className="text-center font-semibold text-foreground text-lg tracking-tight sm:text-left">
				{format(date ?? new Date(), "MMMM yyyy")}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{availableViews.map((availableView) => (
					<Button
						key={availableView}
						type="button"
						variant={currentView === availableView ? "default" : "ghost"}
						size="sm"
						onClick={() => onView?.(availableView)}
						className={cn(
							"rounded-full shadow-sm",
							currentView === availableView
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{availableView.charAt(0).toUpperCase() + availableView.slice(1)}
					</Button>
				))}
			</div>
		</div>
	);
};
