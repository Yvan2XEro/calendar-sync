import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";

import {
	logger as baseLogger,
	metrics,
	type WorkerLogger,
} from "../services/log";

export const eventStatuses = ["pending", "approved", "rejected"] as const;

export const EventSqlInsertSchema = z.object({
	provider_id: z.string().min(1),
	flag_id: z.string().optional().nullable(),
	external_id: z.string().optional().nullable(),

	title: z.string().min(1),
	description: z.string().optional().nullable(),
	location: z.string().optional().nullable(),
	url: z.string().url().optional().nullable(),
	start_at: z.string().datetime({ offset: true }),
	end_at: z.string().datetime({ offset: true }).optional().nullable(),

	is_all_day: z.boolean().default(false),
	is_published: z.boolean().default(false),

	metadata: z.record(z.string(), z.any()).default({}),

	priority: z.number().int().min(1).max(5).default(3),

	status: z.enum(eventStatuses).default("pending"),
});
export type EventSqlInsert = z.infer<typeof EventSqlInsertSchema>;

const SYSTEM_INSTRUCTIONS = `
You are an extraction agent. Decide if an email describes a real-world event (meeting, conference, webinar, class, workshop, deadline, performance, etc.).
If YES, output a single JSON object with fields STRICTLY matching this schema (snake_case):

{
  "title": string,
  "description": string | null,
  "location": string | null,
  "url": string | null,
  "start_at": string,         // ISO 8601 with timezone, e.g. "2025-09-19T13:52:04Z"
  "end_at": string | null,    // ISO 8601 (>= start_at) or null if unknown
  "is_all_day": boolean,
  "is_published": boolean,    // default false if unsure
  "metadata": object,         // e.g. {"source":"email","organizer":"...","message_id":"..."}
  "priority": 1|2|3|4|5,      // default 3 if unknown
  "flag_id": string | null,   // optional
  "external_id": string | null// optional (e.g. email Message-ID)
}

Rules:
- If it is NOT an event, output EXACTLY: null (without quotes).
- Output ONLY one top-level value (either the JSON object above or null). No extra text.
- Prefer the email timezone; else infer reasonably; else use UTC (Z).
- Ensure start_at <= end_at when both present.
- Do not invent URLs; set url to null if uncertain.
- Keep description concise (<= 1000 chars).
`;

/** Utilitaires */
function stripHtml(html?: string) {
	if (!html) return "";
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

type ExtractEventInput = {
	provider_id: string;
	text?: string;
	html?: string;
	messageId?: string;
};

export async function extractEventFromEmail(
	input: ExtractEventInput,
	options?: { logger?: WorkerLogger },
): Promise<EventSqlInsert | null> {
	const { provider_id, text, html, messageId } = input;
	const log =
		options?.logger ?? baseLogger.withContext({ providerId: provider_id });

	const plainFromHtml = stripHtml(html);
	const combined = [text?.trim(), plainFromHtml && !text ? plainFromHtml : ""]
		.filter(Boolean)
		.join("\n\n");
	if (!combined) return null;

	const userPrompt = `
EMAIL CONTENT (plain text approximation):
---
${combined.slice(0, 20000)}
---

KNOWN CONTEXT:
- provider_id: ${provider_id}
- message_id: ${messageId ?? "unknown"}

Follow the rules strictly and respond with either:
- a single JSON object (matching the SCHEMA and snake_case keys), or
- the literal null.
`;

	let raw = "";
	try {
		const { text: modelText } = await generateText({
			// model: google("gemini-1.5-flash"),
			model: anthropic("claude-3-5-sonnet-20240620"),
			system: SYSTEM_INSTRUCTIONS,
			prompt: userPrompt,
			temperature: 0.2,
			maxOutputTokens: 800,
		});
		raw = (modelText || "").trim();
	} catch (err) {
		log.error("AI extraction error", { error: err });
		metrics.incrementCounter("worker_ingest_extraction_failure_total", 1, {
			provider_id,
			reason: "llm_error",
		});
		return null;
	}

	if (!raw || raw === "null") return null;

	const json = tryParseJsonObject(raw);
	if (!json) return null;

	json.provider_id = provider_id;
	if (messageId && (json.external_id == null || json.external_id === "")) {
		json.external_id = messageId;
	}

	const parsed = EventSqlInsertSchema.safeParse(json);
	if (!parsed.success) {
		log.warn("Extraction validation failed", {
			issues: parsed.error.flatten(),
		});
		metrics.incrementCounter("worker_ingest_extraction_failure_total", 1, {
			provider_id,
			reason: "validation",
		});
		return null;
	}

	const start = new Date(parsed.data.start_at);
	const end = parsed.data.end_at ? new Date(parsed.data.end_at) : null;
	if (end && end < start) {
		log.warn("Extraction end before start", {
			startAt: parsed.data.start_at,
			endAt: parsed.data.end_at,
		});
		metrics.incrementCounter("worker_ingest_extraction_failure_total", 1, {
			provider_id,
			reason: "temporal_validation",
		});
		return null;
	}

	return parsed.data;
}

function tryParseJsonObject(maybeJson: string): Record<string, unknown> | null {
	const direct = safeJsonParse(maybeJson);
	if (isPlainRecord(direct)) return direct;

	const fence = maybeJson.match(/```json\s*([\s\S]*?)```/i)?.[1];
	if (fence) {
		const fenced = safeJsonParse(fence);
		if (isPlainRecord(fenced)) return fenced;
	}

	const braces = maybeJson.match(/\{[\s\S]*\}$/)?.[0];
	if (braces) {
		const obj = safeJsonParse(braces);
		if (isPlainRecord(obj)) return obj;
	}
	return null;
}
function safeJsonParse(s: string): unknown {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
