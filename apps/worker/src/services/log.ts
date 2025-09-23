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

export function startWorkerLogSink() {
	transport.start();
}

export async function stopWorkerLogSink() {
	await transport.stop();
}
