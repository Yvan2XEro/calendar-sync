import type { ReactNode } from "react";

import type { EventHeroMedia, EventLandingPageContent } from "@/lib/event-content";
import { formatDisplayDate } from "@/lib/datetime";

type EventLandingHeroProps = {
        title: string;
        startAt: Date;
        endAt: Date | null;
        heroMedia: EventHeroMedia | null;
        landing: EventLandingPageContent | null;
        actionSlot?: ReactNode;
};

export function EventLandingHero({
        title,
        startAt,
        endAt,
        heroMedia,
        landing,
        actionSlot,
}: EventLandingHeroProps) {
        const headline = landing?.headline ?? title;
        const subheadline = landing?.subheadline ?? null;
        return (
                <section className="hero-gradient relative overflow-hidden">
                        <div className="absolute inset-0 bg-black/30" aria-hidden />
                        {heroMedia?.url ? (
                                heroMedia.type === "video" ? (
                                        <video
                                                className="absolute inset-0 h-full w-full object-cover"
                                                src={heroMedia.url}
                                                poster={heroMedia.posterUrl ?? undefined}
                                                autoPlay
                                                loop
                                                muted
                                                playsInline
                                        />
                                ) : (
                                        <img
                                                src={heroMedia.url}
                                                alt={heroMedia.alt ?? "Event hero media"}
                                                className="absolute inset-0 h-full w-full object-cover"
                                        />
                                )
                        ) : null}
                        <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 px-6 py-16 text-white sm:px-12">
                                <p className="text-sm uppercase tracking-wide text-white/80">
                                        {formatDisplayDate(startAt)}
                                        {endAt ? ` – ${formatDisplayDate(endAt)}` : ""}
                                </p>
                                <h1 className="max-w-3xl text-balance font-semibold text-4xl tracking-tight sm:text-5xl">
                                        {headline}
                                </h1>
                                {subheadline ? (
                                        <p className="max-w-3xl text-balance text-lg text-white/80 sm:text-xl">
                                                {subheadline}
                                        </p>
                                ) : null}
                                {actionSlot ? <div className="flex flex-wrap gap-3">{actionSlot}</div> : null}
                        </div>
                </section>
        );
}
