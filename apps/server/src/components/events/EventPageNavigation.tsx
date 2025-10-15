"use client";

import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type EventPageNavigationProps = {
	eventId: string;
	isAdmin: boolean;
};

export function EventPageNavigation({
	eventId,
	isAdmin,
}: EventPageNavigationProps) {
	const router = useRouter();

	return (
		<div className="border-border/60 border-b bg-background/95 supports-[backdrop-filter]:bg-background/60 supports-[backdrop-filter]:backdrop-blur">
			<div className="container mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-6 py-4 sm:px-12">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => {
						if (window.history.length > 1) {
							return router.back();
						}

						return router.push("/dashboard");
					}}
					className="text-foreground/80 hover:text-foreground"
				>
					<ArrowLeft className="size-4" />
					Back
				</Button>
				{isAdmin ? (
					<Button asChild size="sm" variant="outline">
						<Link href={`/admin/events/${eventId}/attendees`}>
							<Users className="size-4" />
							Manage attendees
						</Link>
					</Button>
				) : null}
			</div>
		</div>
	);
}
