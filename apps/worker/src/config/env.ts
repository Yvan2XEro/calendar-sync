import { logger } from "../services/log";

function parseIntEnv(name: string, defaultValue: number): number {
        const raw = process.env[name];
        if (!raw) return defaultValue;
        const parsed = Number.parseInt(raw, 10);
        if (Number.isNaN(parsed)) {
                logger.warn("Invalid numeric environment value", {
			source: "config",
			name,
			rawValue: raw,
			defaultValue,
		});
		return defaultValue;
	}
	return parsed;
}

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
        const raw = process.env[name];
        if (raw == null) return defaultValue;

        const normalized = raw.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") {
                return true;
        }
        if (normalized === "false" || normalized === "0") {
                return false;
        }

        logger.warn("Invalid boolean environment value", {
                source: "config",
                name,
                rawValue: raw,
                defaultValue,
        });
        return defaultValue;
}

export interface WorkerConfig {
        maxConcurrentProviders: number;
        pollIntervalMs: number;
        idleKeepaliveMs: number;
        backoffMinMs: number;
        backoffMaxMs: number;
        useFakeExtractor: boolean;
}

let cached: WorkerConfig | null = null;

export function getWorkerConfig(): WorkerConfig {
	if (cached) {
		return cached;
	}

        cached = {
                maxConcurrentProviders: Math.max(
                        1,
                        parseIntEnv("WORKER_MAX_CONCURRENT_PROVIDERS", 5),
                ),
		pollIntervalMs: Math.max(
			1_000,
			parseIntEnv("WORKER_POLL_INTERVAL_MS", 300_000),
                ),
                idleKeepaliveMs: Math.max(
                        1_000,
                        parseIntEnv("WORKER_IDLE_KEEPALIVE_MS", 15_000),
                ),
                backoffMinMs: Math.max(100, parseIntEnv("WORKER_BACKOFF_MIN_MS", 1_000)),
                backoffMaxMs: Math.max(100, parseIntEnv("WORKER_BACKOFF_MAX_MS", 60_000)),
                useFakeExtractor: parseBooleanEnv("WORKER_USE_FAKE_EXTRACTOR", false),
        };

	if (cached.backoffMaxMs < cached.backoffMinMs) {
		cached.backoffMaxMs = cached.backoffMinMs;
	}

	return cached;
}
