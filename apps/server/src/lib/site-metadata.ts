const FALLBACK_SITE_URL = "http://localhost:3000";

function cleanBaseUrl(url: string) {
        return url.replace(/\/$/, "");
}

export function getSiteBaseUrl(): string {
        const candidate =
                process.env.NEXT_PUBLIC_APP_URL ||
                process.env.APP_BASE_URL ||
                process.env.APP_URL ||
                process.env.VERCEL_PROJECT_PRODUCTION_URL ||
                process.env.VERCEL_URL;
        if (!candidate) return FALLBACK_SITE_URL;
        if (candidate.startsWith("http")) {
                return cleanBaseUrl(candidate);
        }
        return cleanBaseUrl(`https://${candidate}`);
}

export function buildAbsoluteUrl(path: string): string {
        const base = getSiteBaseUrl();
        try {
                return new URL(path, base).toString();
        } catch (error) {
                const normalizedPath = path.startsWith("/") ? path : `/${path}`;
                return `${base}${normalizedPath}`;
        }
}
