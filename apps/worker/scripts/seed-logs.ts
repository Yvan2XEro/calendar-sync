import { randomUUID } from "node:crypto";

import {
	logger,
	startWorkerLogSink,
	stopWorkerLogSink,
} from "../src/services/log";

async function main() {
	startWorkerLogSink();

	const providerId = `seed-provider-${new Date().toISOString()}`;
	const sessionLogger = logger.withContext({
		providerId,
		sessionId: randomUUID(),
	});

	sessionLogger.info("Seeding informational log", {
		action: "seed",
		step: "info",
	});

	sessionLogger.debug("Seeding debug log", {
		action: "seed",
		detail: "Debug level entry for verification",
	});

	sessionLogger.warn("Seeding warning log", {
		action: "seed",
		warning: "Sample warning for admin review",
	});

	sessionLogger.error("Seeding error log", {
		action: "seed",
		error: new Error("Sample error for log seeding"),
	});

	const secondaryLogger = logger.withContext({
		providerId: `${providerId}-secondary`,
		sessionId: randomUUID(),
	});

	secondaryLogger.info("Secondary session activity", {
		action: "seed",
		detail: "Secondary provider log entry",
	});

	await stopWorkerLogSink();
}

if (import.meta.main) {
	main().catch(async (error) => {
		logger.error("Failed to seed logs", { error });
		await stopWorkerLogSink();
		process.exitCode = 1;
	});
}
