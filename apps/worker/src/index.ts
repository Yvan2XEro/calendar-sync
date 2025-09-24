import { randomUUID } from "node:crypto";

import { getWorkerConfig } from "./config/env";
import { getActiveProviders } from "./db/providers";
import { runProviderSession } from "./imap/session";
import { createSemaphore } from "./services/concurrency";
import { logger, startWorkerLogSink, stopWorkerLogSink } from "./services/log";

async function main() {
	startWorkerLogSink();

	const workerConfig = getWorkerConfig();
	logger.info("Worker starting", {
		maxConcurrentProviders: workerConfig.maxConcurrentProviders,
	});

	const providers = await getActiveProviders();
	if (providers.length === 0) {
		logger.warn("No active providers found", { activeCount: 0 });
		await stopWorkerLogSink();
		return;
	}

	const allowed = providers.slice(0, workerConfig.maxConcurrentProviders);
	if (allowed.length < providers.length) {
		logger.warn("Active providers exceed concurrency limit", {
			activeProviders: providers.length,
			maxConcurrentProviders: workerConfig.maxConcurrentProviders,
			allowedProviders: allowed.length,
		});
	}

	const semaphore = createSemaphore(workerConfig.maxConcurrentProviders);
	const controllers = new Map<string, AbortController>();

	let shuttingDown = false;

	const sessionPromises = allowed.map(async (provider) => {
		const release = await semaphore.acquire();
		const controller = new AbortController();
		controllers.set(provider.id, controller);

		const sessionId = randomUUID();
		const sessionLogger = logger.withContext({
			providerId: provider.id,
			sessionId,
		});

		sessionLogger.info("Session starting", {
			providerName: provider.name,
		});

		try {
			await runProviderSession(provider, {
				workerConfig,
				signal: controller.signal,
				logger: sessionLogger,
			});
		} catch (error) {
			if (!controller.signal.aborted) {
				sessionLogger.error("Session terminated unexpectedly", {
					error,
				});
			}
		} finally {
			controllers.delete(provider.id);
			release();
			sessionLogger.info("Session stopped");
		}
	});

	const shutdown = async (signal: string) => {
		if (shuttingDown) return;
		shuttingDown = true;

		logger.info("Shutdown signal received", { signal });

		for (const controller of controllers.values()) {
			controller.abort();
		}

		await Promise.allSettled(sessionPromises);

		logger.info("All provider sessions stopped. Goodbye.");
		await stopWorkerLogSink();
	};

	const handleSigint = () => void shutdown("SIGINT");
	const handleSigterm = () => void shutdown("SIGTERM");

	process.on("SIGINT", handleSigint);
	process.on("SIGTERM", handleSigterm);

	const onUnhandledRejection = (reason: unknown) => {
		logger.error("Unhandled rejection detected", { reason });
	};
	process.on("unhandledRejection", onUnhandledRejection);

	await Promise.allSettled(sessionPromises);

	process.off("SIGINT", handleSigint);
	process.off("SIGTERM", handleSigterm);
	process.off("unhandledRejection", onUnhandledRejection);

	if (!shuttingDown) {
		await stopWorkerLogSink();
	}
}

if (import.meta.main) {
	main().catch(async (error) => {
		logger.error("Worker failed", { error });
		await stopWorkerLogSink();
		process.exitCode = 1;
	});
}
