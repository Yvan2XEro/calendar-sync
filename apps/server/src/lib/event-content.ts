export type EventHeroMediaType = "image" | "video";

export type EventHeroMedia = {
        type?: EventHeroMediaType;
        url?: string;
        alt?: string;
        posterUrl?: string;
};

export type EventLandingPageCTA = {
        label?: string;
        href?: string;
};

export type EventLandingPageContent = {
        headline?: string;
        subheadline?: string;
        body?: string;
        seoDescription?: string;
        cta?: EventLandingPageCTA;
};

export function parseHeroMedia(value: unknown): EventHeroMedia {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
                return {};
        }

        const raw = value as Record<string, unknown>;
        const type = raw.type === "image" || raw.type === "video" ? raw.type : undefined;
        const url = typeof raw.url === "string" ? raw.url : undefined;
        const alt = typeof raw.alt === "string" ? raw.alt : undefined;
        const posterUrl = typeof raw.posterUrl === "string" ? raw.posterUrl : undefined;

        const result: EventHeroMedia = {};
        if (type) result.type = type;
        if (url) result.url = url;
        if (alt) result.alt = alt;
        if (posterUrl) result.posterUrl = posterUrl;

        return result;
}

export function parseLandingPage(value: unknown): EventLandingPageContent {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
                return {};
        }

        const raw = value as Record<string, unknown>;

        const result: EventLandingPageContent = {};
        if (typeof raw.headline === "string" && raw.headline.trim().length > 0) {
                result.headline = raw.headline;
        }
        if (typeof raw.subheadline === "string" && raw.subheadline.trim().length > 0) {
                result.subheadline = raw.subheadline;
        }
        if (typeof raw.body === "string" && raw.body.trim().length > 0) {
                result.body = raw.body;
        }
        if (typeof raw.seoDescription === "string" && raw.seoDescription.trim().length > 0) {
                result.seoDescription = raw.seoDescription;
        }

        const ctaValue = raw.cta;
        if (ctaValue && typeof ctaValue === "object" && !Array.isArray(ctaValue)) {
                const ctaRecord = ctaValue as Record<string, unknown>;
                const label =
                        typeof ctaRecord.label === "string" && ctaRecord.label.trim().length > 0
                                ? ctaRecord.label
                                : undefined;
                const href =
                        typeof ctaRecord.href === "string" && ctaRecord.href.trim().length > 0
                                ? ctaRecord.href
                                : undefined;
                if (label || href) {
                        result.cta = {};
                        if (label) result.cta.label = label;
                        if (href) result.cta.href = href;
                }
        }

        return result;
}

export function hasLandingContent(content: EventLandingPageContent | null | undefined) {
        if (!content) return false;
        return Boolean(
                content.headline ||
                        content.subheadline ||
                        content.body ||
                        content.seoDescription ||
                        content.cta?.label ||
                        content.cta?.href,
        );
}
