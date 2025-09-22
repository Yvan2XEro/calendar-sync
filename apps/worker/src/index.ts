import { getWorkerConfig } from "./config/env";
import { getActiveProviders } from "./db/providers";
import { runProviderSession } from "./imap/session";
import { createSemaphore } from "./services/concurrency";
import { logger } from "./services/log";

async function main() {
	const workerConfig = getWorkerConfig();
	logger.info(
		`Worker starting with max ${workerConfig.maxConcurrentProviders} concurrent provider(s).`,
	);

	const providers = await getActiveProviders();
	if (providers.length === 0) {
		logger.warn("No active providers found. Worker will remain idle.");
		return;
	}

	const allowed = providers.slice(0, workerConfig.maxConcurrentProviders);
	if (allowed.length < providers.length) {
		logger.warn(
			`Active providers (${providers.length}) exceed concurrency limit (${workerConfig.maxConcurrentProviders}). Only the first ${allowed.length} will start.`,
		);
	}

	const semaphore = createSemaphore(workerConfig.maxConcurrentProviders);
	const controllers = new Map<string, AbortController>();

	let shuttingDown = false;

	const sessionPromises = allowed.map(async (provider) => {
		const release = await semaphore.acquire();
		const controller = new AbortController();
		controllers.set(provider.id, controller);

		logger.info(`[${provider.id}] Session starting.`);

		try {
			await runProviderSession(provider, {
				workerConfig,
				signal: controller.signal,
			});
		} catch (error) {
			if (!controller.signal.aborted) {
				logger.error(
					`[${provider.id}] Session terminated unexpectedly.`,
					error,
				);
			}
		} finally {
			controllers.delete(provider.id);
			release();
			logger.info(`[${provider.id}] Session stopped.`);
		}
	});

	const shutdown = async (signal: string) => {
		if (shuttingDown) return;
		shuttingDown = true;

		logger.info(`Received ${signal}. Shutting down worker…`);

		for (const controller of controllers.values()) {
			controller.abort();
		}

		await Promise.allSettled(sessionPromises);

		logger.info("All provider sessions stopped. Goodbye.");
	};

	const handleSigint = () => void shutdown("SIGINT");
	const handleSigterm = () => void shutdown("SIGTERM");

	process.on("SIGINT", handleSigint);
	process.on("SIGTERM", handleSigterm);

	const onUnhandledRejection = (reason: unknown) => {
		logger.error("Unhandled rejection detected", reason);
	};
	process.on("unhandledRejection", onUnhandledRejection);

	await Promise.allSettled(sessionPromises);

	process.off("SIGINT", handleSigint);
	process.off("SIGTERM", handleSigterm);
	process.off("unhandledRejection", onUnhandledRejection);
}

if (import.meta.main) {
	main().catch((error) => {
		logger.error("Worker failed", error);
		process.exitCode = 1;
	});
}
