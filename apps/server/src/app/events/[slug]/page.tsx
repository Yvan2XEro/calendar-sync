import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";

import { EventLandingDetails } from "@/components/events/EventLandingDetails";
import { EventLandingHero } from "@/components/events/EventLandingHero";
import { db } from "@/db";
import { event } from "@/db/schema/app";
import {
        hasLandingContent,
        parseHeroMedia,
        parseLandingPage,
} from "@/lib/event-content";
import { buildAbsoluteUrl, getSiteBaseUrl } from "@/lib/site-metadata";

const fetchPublishedEvent = cache(async (slug: string) => {
        const rows = await db
                .select({
                        id: event.id,
                        title: event.title,
                        description: event.description,
                        startAt: event.startAt,
                        endAt: event.endAt,
                        location: event.location,
                        url: event.url,
                        heroMedia: event.heroMedia,
                        landingPage: event.landingPage,
                        metadata: event.metadata,
                        updatedAt: event.updatedAt,
                        createdAt: event.createdAt,
                        isPublished: event.isPublished,
                        status: event.status,
                })
                .from(event)
                .where(
                        and(
                                eq(event.slug, slug),
                                eq(event.isPublished, true),
                                eq(event.status, "approved"),
                        ),
                )
                .limit(1);

        const row = rows.at(0);
        if (!row) return null;

        return {
                id: row.id,
                slug,
                title: row.title,
                description: row.description,
                startAt: row.startAt,
                endAt: row.endAt,
                location: row.location,
                url: row.url,
                heroMedia: parseHeroMedia(row.heroMedia),
                landingPage: parseLandingPage(row.landingPage),
                metadata: row.metadata ?? {},
                updatedAt: row.updatedAt,
                createdAt: row.createdAt,
        } as const;
});

export async function generateStaticParams() {
        const rows = await db
                .select({ slug: event.slug })
                .from(event)
                .where(and(eq(event.isPublished, true), eq(event.status, "approved")));
        return rows.map((row) => ({ slug: row.slug }));
}

export async function generateMetadata({
        params,
}: {
        params: { slug: string };
}): Promise<Metadata> {
        const record = await fetchPublishedEvent(params.slug);
        if (!record) {
                return {
                        title: "Event not found",
                } satisfies Metadata;
        }

        const canonical = buildAbsoluteUrl(`/events/${record.slug}`);
        const baseTitle = record.landingPage?.headline ?? record.title;
        const description =
                record.landingPage?.seoDescription ??
                record.landingPage?.subheadline ??
                record.description ??
                undefined;
        const hero = record.heroMedia;
        const images =
                hero?.type === "image" && hero.url ? [{ url: hero.url }] : undefined;
        const videos =
                hero?.type === "video" && hero.url
                        ? [
                                  {
                                          url: hero.url,
                                          width: 1280,
                                          height: 720,
                                          alt: hero.alt,
                                  },
                          ]
                        : undefined;

        return {
                metadataBase: new URL(getSiteBaseUrl()),
                title: baseTitle,
                description,
                alternates: {
                        canonical,
                },
                openGraph: {
                        title: baseTitle,
                        description,
                        url: canonical,
                        type: "event",
                        images,
                        videos,
                        startTime: record.startAt?.toISOString(),
                        endTime: record.endAt?.toISOString(),
                        locale: "en_US",
                },
                twitter: {
                        card: images?.length ? "summary_large_image" : "summary",
                        title: baseTitle,
                        description,
                        images: images?.map((image) => image.url),
                },
        } satisfies Metadata;
}

export default async function EventLandingPage({
        params,
}: {
        params: { slug: string };
}) {
        const record = await fetchPublishedEvent(params.slug);
        if (!record) notFound();

        const hasRichContent =
                hasLandingContent(record.landingPage) || Boolean(record.heroMedia?.url);

        if (!hasRichContent) {
                if (record.url) {
                        redirect(record.url);
                }
                notFound();
        }

        const ctaHref = record.landingPage?.cta?.href ?? record.url ?? null;
        const ctaLabel = record.landingPage?.cta?.label ?? (ctaHref ? "Visit event site" : null);

        return (
                <main className="flex min-h-screen flex-col bg-background">
                        <EventLandingHero
                                title={record.title}
                                startAt={record.startAt}
                                endAt={record.endAt}
                                heroMedia={record.heroMedia}
                                landing={record.landingPage}
                                actionSlot=
                                        ctaHref && ctaLabel ? (
                                                <a
                                                        className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow hover:bg-white/90"
                                                        href={ctaHref}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                >
                                                        {ctaLabel}
                                                </a>
                                        ) : undefined
                        />
                        <EventLandingDetails
                                description={record.description}
                                landing={record.landingPage}
                                startAt={record.startAt}
                                endAt={record.endAt}
                                location={record.location}
                                fallbackUrl={record.url}
                        />
                </main>
        );
}
