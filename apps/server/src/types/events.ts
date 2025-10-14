import type {
	EventHeroMedia,
	EventLandingPageContent,
} from "@/lib/event-content";

export type UpcomingEvent = {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	location: string | null;
	url: string | null;
	heroMedia: EventHeroMedia;
	landingPage: EventLandingPageContent;
	startAt: string;
	endAt: string | null;
	organization: {
		id: string;
		name: string;
		slug: string;
	};
	providerName: string;
	imageUrl: string | null;
	participantCount: number | null;
	isParticipant: boolean;
};
