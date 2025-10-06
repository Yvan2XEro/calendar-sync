import { createSocket } from "node:dgram";
import { sql } from "bun";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
	providerId?: string | null;
	sessionId?: string | null;
};

export type LogPayload = Record<string, unknown>;

type QueueEntry = {
	level: LogLevel;
	message: string;
	context: LogContext;
	payload: LogPayload | null;
};

const BATCH_SIZE = 25;
const FLUSH_INTERVAL_MS = 1_000;

class DatabaseTransport {
	#queue: QueueEntry[] = [];
	#timer: ReturnType<typeof setInterval> | undefined;
	#flushing = false;
	#started = false;

	start() {
		if (this.#started) return;
		this.#started = true;
		this.#timer = setInterval(() => {
			void this.flush();
		}, FLUSH_INTERVAL_MS);
		void this.flush();
	}

	async stop() {
		if (!this.#started) return;
		this.#started = false;
		if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = undefined;
		}
		await this.flush();
	}

	enqueue(entry: QueueEntry) {
		this.#queue.push(entry);
		if (!this.#started) return;
		if (this.#queue.length >= BATCH_SIZE) {
			void this.flush();
		}
	}

	async flush() {
		if (this.#flushing) return;
		if (this.#queue.length === 0) return;
		this.#flushing = true;

		try {
			while (this.#queue.length > 0) {
				const batch = this.#queue.splice(0, BATCH_SIZE);
				const rows = batch.map((entry) => ({
					level: entry.level,
					provider_id: entry.context.providerId ?? null,
					session_id: entry.context.sessionId ?? null,
					msg: entry.message,
					data: entry.payload,
				}));

				try {
					await sql`
                                                INSERT INTO worker_log ${sql(
																									rows,
																									"level",
																									"provider_id",
																									"session_id",
																									"msg",
																									"data",
																								)}
                                        `;
				} catch (error) {
					console.error("[worker][log] Failed to persist log batch", error);
					this.#queue.unshift(...batch);
					break;
				}
			}
		} finally {
			this.#flushing = false;
		}
	}
}

const transport = new DatabaseTransport();

function formatMessage(level: LogLevel, message: string, context: LogContext) {
	const ts = new Date().toISOString();
	const parts = ["[worker]", `[${ts}]`, `[${level.toUpperCase()}]`];
	if (context.providerId) parts.push(`[provider:${context.providerId}]`);
	if (context.sessionId) parts.push(`[session:${context.sessionId}]`);
	return `${parts.join(" ")} ${message}`;
}

function sanitizeError(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
			cause: sanitizeValue(error.cause),
		} satisfies Record<string, unknown>;
	}
	return sanitizeValue(error);
}

function sanitizeValue(value: unknown): unknown {
	if (value instanceof Error) {
		return sanitizeError(value);
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (value instanceof Buffer) {
		return { type: "Buffer", data: value.toString("base64") };
	}
	if (Array.isArray(value)) {
		return value.map((item) => sanitizeValue(item));
	}
	if (value && typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value)) {
			result[key] = sanitizeValue(val);
		}
		return result;
	}
	if (typeof value === "bigint") {
		return value.toString();
	}
	return value ?? null;
}

function sanitizePayload(payload?: LogPayload | null, meta: unknown[] = []) {
	const base: Record<string, unknown> = {};
	if (payload) {
		for (const [key, value] of Object.entries(payload)) {
			base[key] = sanitizeValue(value);
		}
	}

	if (meta.length > 0) {
		const serializedMeta = meta.map((item) => sanitizeValue(item));
		base.meta =
			serializedMeta.length === 1 ? serializedMeta[0] : serializedMeta;
	}

	return Object.keys(base).length > 0 ? base : null;
}

type LogMethod = (
	message: string,
	payload?: LogPayload | null,
	...meta: unknown[]
) => void;

export interface WorkerLogger {
	debug: LogMethod;
	info: LogMethod;
	warn: LogMethod;
	error: LogMethod;
	withContext(context: LogContext): WorkerLogger;
}

export type MetricTags = Record<
	string,
	string | number | boolean | null | undefined
>;

export interface WorkerMetrics {
	incrementCounter(name: string, value?: number, tags?: MetricTags): void;
}

type CounterAlertState = {
	threshold: number;
	level: LogLevel;
	message: string | null;
	lastTriggeredValue: number;
};

type CounterAlertConfig = {
	threshold: number;
	level?: LogLevel;
	message?: string;
};

class StatsdClient {
	#socket = createSocket("udp4");
	#host: string;
	#port: number;
	#prefix: string;
	#lastErrorAt = 0;

	constructor(options: { host: string; port: number; prefix?: string }) {
		this.#host = options.host;
		this.#port = options.port;
		this.#prefix = options.prefix ?? "";
		try {
			this.#socket.unref();
		} catch {
			// Bun may not expose unref; ignore.
		}
	}

	counter(name: string, value: number, tags?: MetricTags) {
		const metricName = this.#sanitizeName(name);
		const serializedTags = this.#formatTags(tags);
		const payload = `${metricName}:${value}|c${serializedTags}`;
		this.#send(payload);
	}

	close() {
		try {
			this.#socket.close();
		} catch {
			// ignore closing errors
		}
	}

	#sanitizeName(name: string): string {
		const sanitized = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
		return `${this.#prefix}${sanitized}`;
	}

	#sanitizeTag(value: string): string {
		return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
	}

	#formatTags(tags?: MetricTags): string {
		if (!tags) return "";
		const entries = Object.entries(tags).filter(([, value]) => value != null);
		if (entries.length === 0) return "";
		const serialized = entries
			.map(([key, value]) => {
				const tagValue = this.#sanitizeTag(String(value));
				return `${this.#sanitizeTag(key)}:${tagValue}`;
			})
			.join(",");
		return serialized ? `|#${serialized}` : "";
	}

	#send(payload: string) {
		try {
			this.#socket.send(payload, this.#port, this.#host, (err) => {
				if (err) this.#handleError(err);
			});
		} catch (error) {
			this.#handleError(error);
		}
	}

	#handleError(error: unknown) {
		const now = Date.now();
		if (now - this.#lastErrorAt < 60_000) return;
		this.#lastErrorAt = now;
		console.warn("[worker][metrics] StatsD send failed", error);
	}
}

function createStatsdClientFromEnv(): StatsdClient | null {
	const host = process.env.WORKER_STATSD_HOST;
	const portRaw = process.env.WORKER_STATSD_PORT;
	if (!host || !portRaw) return null;
	const port = Number.parseInt(portRaw, 10);
	if (Number.isNaN(port)) {
		console.warn("[worker][metrics] Invalid WORKER_STATSD_PORT value", portRaw);
		return null;
	}
	const prefix = process.env.WORKER_STATSD_PREFIX ?? "worker.";
	return new StatsdClient({ host, port, prefix });
}

function resolveThreshold(envName: string, fallback: number): number | null {
	const raw = process.env[envName];
	if (raw == null) {
		return fallback > 0 ? fallback : null;
	}
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed)) {
		console.warn("[worker][metrics] Invalid numeric threshold", envName, raw);
		return fallback > 0 ? fallback : null;
	}
	if (parsed <= 0) {
		return null;
	}
	return parsed;
}

class WorkerMetricsImpl implements WorkerMetrics {
	#statsd: StatsdClient | null;
	#logger: WorkerLogger | null = null;
	#counters = new Map<string, number>();
	#alerts = new Map<string, CounterAlertState>();

	constructor() {
		this.#statsd = createStatsdClientFromEnv();
	}

	bindLogger(logger: WorkerLogger) {
		this.#logger = logger;
	}

	incrementCounter(name: string, value = 1, tags?: MetricTags) {
		const increment = Number.isFinite(value) ? value : 1;
		const total = (this.#counters.get(name) ?? 0) + increment;
		this.#counters.set(name, total);

		if (this.#statsd) {
			this.#statsd.counter(name, increment, tags);
		}

		this.#evaluateAlerts(name, total, tags);
	}

	registerCounterAlert(name: string, config: CounterAlertConfig) {
		if (!Number.isFinite(config.threshold) || config.threshold <= 0) {
			return;
		}
		this.#alerts.set(name, {
			threshold: config.threshold,
			level: config.level ?? "warn",
			message: config.message ?? null,
			lastTriggeredValue: 0,
		});
	}

	shutdown() {
		this.#statsd?.close();
	}

	#evaluateAlerts(name: string, value: number, tags?: MetricTags) {
		const alert = this.#alerts.get(name);
		if (!alert) return;
		if (value < alert.threshold) return;
		if (value - alert.lastTriggeredValue < alert.threshold) return;

		alert.lastTriggeredValue = value;
		this.#alerts.set(name, alert);

		const payload: Record<string, unknown> = {
			metric: name,
			total: value,
			threshold: alert.threshold,
		};
		if (tags) {
			payload.tags = sanitizeValue(tags);
		}

		const message =
			alert.message ?? `Metric ${name} exceeded threshold ${alert.threshold}`;
		this.#log(alert.level, message, payload);
	}

	#log(level: LogLevel, message: string, payload: Record<string, unknown>) {
		if (this.#logger) {
			this.#logger[level](message, payload);
			return;
		}

		const formatted = `[worker][metrics] ${message}`;
		if (level === "error") {
			console.error(formatted, payload);
		} else if (level === "warn") {
			console.warn(formatted, payload);
		} else {
			console.info(formatted, payload);
		}
	}
}

const metricsImpl = new WorkerMetricsImpl();

export const metrics: WorkerMetrics = metricsImpl;

class LoggerImpl implements WorkerLogger {
	#context: LogContext;

	constructor(context: LogContext = {}) {
		this.#context = { ...context };
	}

	#write(
		level: LogLevel,
		message: string,
		payload?: LogPayload | null,
		meta: unknown[] = [],
	) {
		const sanitized = sanitizePayload(payload, meta);
		transport.enqueue({
			level,
			message,
			context: this.#context,
			payload: sanitized,
		});

		const formatted = formatMessage(level, message, this.#context);
		const consolePayload = sanitized ?? undefined;
		switch (level) {
			case "debug":
				if (consolePayload) console.debug(formatted, consolePayload);
				else console.debug(formatted);
				break;
			case "info":
				if (consolePayload) console.info(formatted, consolePayload);
				else console.info(formatted);
				break;
			case "warn":
				if (consolePayload) console.warn(formatted, consolePayload);
				else console.warn(formatted);
				break;
			default:
				if (consolePayload) console.error(formatted, consolePayload);
				else console.error(formatted);
				break;
		}
	}

	debug: LogMethod = (message, payload, ...meta) =>
		this.#write("debug", message, payload, meta);
	info: LogMethod = (message, payload, ...meta) =>
		this.#write("info", message, payload, meta);
	warn: LogMethod = (message, payload, ...meta) =>
		this.#write("warn", message, payload, meta);
	error: LogMethod = (message, payload, ...meta) =>
		this.#write("error", message, payload, meta);

	withContext(context: LogContext): WorkerLogger {
		return new LoggerImpl({ ...this.#context, ...context });
	}
}

export const logger: WorkerLogger = new LoggerImpl();

metricsImpl.bindLogger(logger);

const extractionFailureThreshold = resolveThreshold(
	"WORKER_ALERT_EXTRACTION_FAILURE_THRESHOLD",
	25,
);
if (extractionFailureThreshold) {
	metricsImpl.registerCounterAlert("worker_ingest_extraction_failure_total", {
		threshold: extractionFailureThreshold,
		level: "warn",
		message: "Extraction failure volume exceeded threshold",
	});
}

const insertFailureThreshold = resolveThreshold(
	"WORKER_ALERT_INSERT_FAILURE_THRESHOLD",
	10,
);
if (insertFailureThreshold) {
	metricsImpl.registerCounterAlert("worker_ingest_insert_failure_total", {
		threshold: insertFailureThreshold,
		level: "error",
		message: "Insert failure volume exceeded threshold",
	});
}

export function startWorkerLogSink() {
	transport.start();
}

export async function stopWorkerLogSink() {
	await transport.stop();
	metricsImpl.shutdown();
}
