import type { FetchMessageObject } from "imapflow";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { WorkerConfig } from "../config/env";
import { insertEvent } from "../db/events";
import { getProviderCursor, setProviderCursor } from "../db/providers";
import { createBackoff } from "../services/backoff";
import { logger } from "../services/log";
import type { ImapConfig, ProviderRecord } from "../types/provider";
import { extractEventFromEmail } from "../utils/mailparser";
import { extractEventFromEmailFake } from "../utils/mailparser-test";

const IS_DEV = true;
const extractEvent = !IS_DEV
	? extractEventFromEmail
	: extractEventFromEmailFake;
export interface ProviderSessionOptions {
	workerConfig: WorkerConfig;
	signal: AbortSignal;
}

const FETCH_OPTIONS = {
	uid: true,
	envelope: true,
	internalDate: true,
	source: true,
	flags: true,
	bodyStructure: true,
} satisfies Parameters<ImapFlow["fetch"]>[1];

function resolveMailbox(config: ImapConfig | undefined): string {
	const value = config?.mailbox;
	if (!value || typeof value !== "string") return "INBOX";
	return value;
}

function safeHtmlToString(html: unknown): string | undefined {
	if (!html) return undefined;
	if (typeof html === "string") return html;
	if (Array.isArray(html)) return html.join(" ");
	if (typeof html === "object" && "toString" in html) {
		try {
			const str = String(html);
			return str === "[object Object]" ? undefined : str;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function normalizeInternalDate(
	value: Date | string | null | undefined,
): Date | null {
	if (!value) return null;
	if (value instanceof Date) return value;
	const timestamp = Date.parse(value);
	if (Number.isNaN(timestamp)) return null;
	return new Date(timestamp);
}

function synthesizeExternalId(params: {
	providerId: string;
	mailbox: string;
	uid: number;
	internalDate?: Date | null;
}): string {
	const timestamp = params.internalDate?.getTime();
	return [
		"imap",
		params.providerId,
		params.mailbox,
		params.uid,
		timestamp ?? Date.now(),
	].join(":");
}

async function handleMessage(
	provider: ProviderRecord,
	mailbox: string,
	message: FetchMessageObject,
): Promise<boolean> {
	const uid = message.uid;
	if (!uid) return false;

	const source = message.source;
	if (!source) {
		logger.warn(`[${provider.id}] Message UID ${uid} missing raw source.`);
		return false;
	}

	let parsed;
	try {
		parsed = await simpleParser(source as Buffer);
	} catch (error) {
		logger.error(`[${provider.id}] Failed to parse message UID ${uid}.`, error);
		return false;
	}

	const messageId =
		parsed.messageId || message.envelope?.messageId || undefined;
	const text = parsed.text ?? undefined;
	const html = safeHtmlToString(parsed.html ?? undefined);
	const internalDate = normalizeInternalDate(message.internalDate);

	const extraction = await extractEvent({
		provider_id: provider.id,
		text,
		html,
		messageId,
	});

	if (!extraction) {
		logger.debug(
			`[${provider.id}] Message UID ${uid} did not produce an event payload.`,
		);
		return false;
	}

	const externalId =
		extraction.external_id ||
		messageId ||
		synthesizeExternalId({
			providerId: provider.id,
			mailbox,
			uid,
			internalDate,
		});

	const metadata = {
		...(extraction.metadata ?? {}),
		imap_uid: uid,
		mailbox,
		message_id: messageId ?? null,
		internal_date: internalDate ? internalDate.toISOString() : null,
	};

	const inserted = await insertEvent({
		...extraction,
		external_id: externalId,
		metadata,
	});

	if (!inserted) {
		logger.debug(
			`[${provider.id}] Event with external_id=${externalId} already existed.`,
		);
		return false;
	}

	logger.info(
		`[${provider.id}] Inserted event ${inserted.id} from UID ${uid}.`,
	);
	return true;
}

export async function runProviderSession(
	provider: ProviderRecord,
	options: ProviderSessionOptions,
): Promise<void> {
	const imapConfig = provider.config.imap;
	if (!imapConfig) {
		logger.warn(`[${provider.id}] Missing IMAP configuration. Skipping.`);
		return;
	}

	const mailbox = resolveMailbox(imapConfig);
	const { workerConfig, signal } = options;
	const backoff = createBackoff({
		minMs: workerConfig.backoffMinMs,
		maxMs: workerConfig.backoffMaxMs,
	});

	let stopRequested = signal.aborted;
	const onAbort = () => {
		stopRequested = true;
	};
	signal.addEventListener("abort", onAbort);

	try {
		while (!stopRequested) {
			const client = new ImapFlow({
				host: imapConfig.host,
				port: imapConfig.port,
				secure: imapConfig.secure,
				auth: { ...imapConfig.auth },
				logger: false,
				maxIdleTime: workerConfig.idleKeepaliveMs,
			});

			client.on("error", (err) => {
				logger.error(`[${provider.id}] IMAP client error.`, err);
			});

			try {
				logger.info(
					`[${provider.id}] Connecting to ${imapConfig.host}:${imapConfig.port}…`,
				);
				await client.connect();
				const mailboxInfo = await client.mailboxOpen(mailbox);
				logger.info(
					`[${provider.id}] Mailbox ${mailbox} opened (exists=${mailboxInfo.exists}, uidNext=${mailboxInfo.uidNext}).`,
				);

				const storedCursor = await getProviderCursor(provider.id);
				let lastSeenUid: number;
				if (storedCursor == null) {
					lastSeenUid = (mailboxInfo.uidNext ?? 1) - 1;
					await setProviderCursor(provider.id, lastSeenUid);
					logger.debug(
						`[${provider.id}] Initialized cursor to UID ${lastSeenUid}.`,
					);
				} else {
					lastSeenUid = storedCursor;
				}

				let fetchRequested = true;
				let lastPollAt = 0;
				let processing = false;

				const processNewMessages = async (opts?: { force?: boolean }) => {
					if (!client.mailbox) return;
					if (
						!opts?.force &&
						!fetchRequested &&
						Date.now() - lastPollAt < workerConfig.pollIntervalMs
					) {
						return;
					}
					fetchRequested = false;

					const startUid = lastSeenUid + 1;
					const range = `${startUid}:*`;
					let processed = 0;

					for await (const message of client.fetch(
						{ uid: range },
						FETCH_OPTIONS,
					)) {
						if (stopRequested) break;
						if (!message.uid) continue;

						try {
							const inserted = await handleMessage(provider, mailbox, message);
							if (inserted) processed += 1;
						} catch (error) {
							fetchRequested = true;
							throw error;
						} finally {
							lastSeenUid = Math.max(lastSeenUid, message.uid ?? lastSeenUid);
							await setProviderCursor(provider.id, lastSeenUid);
						}
					}

					if (processed > 0) {
						logger.info(
							`[${provider.id}] Processed ${processed} new message(s). Cursor=${lastSeenUid}.`,
						);
					}
					lastPollAt = Date.now();
				};

				const triggerProcess = async (force = false) => {
					if (processing) return;
					processing = true;
					try {
						await processNewMessages({ force });
					} finally {
						processing = false;
					}
				};

				client.on("exists", () => {
					void triggerProcess(true).catch((error) => {
						logger.error(`[${provider.id}] Error on exists->process`, error);
					});
				});

				await triggerProcess(true);

				while (!stopRequested && client.usable) {
					try {
						await client.idle();
					} catch (error) {
						if (stopRequested) break;
						logger.warn(
							`[${provider.id}] IDLE loop interrupted.`,
							error instanceof Error ? error.message : error,
						);
					}

					await triggerProcess(false);

					if (Date.now() - lastPollAt >= workerConfig.pollIntervalMs) {
						await triggerProcess(true);
					}
				}

				backoff.reset();
				if (stopRequested) {
					logger.info(`[${provider.id}] Session stopping.`);
				}
			} catch (error) {
				if (stopRequested) {
					logger.debug(`[${provider.id}] Session aborted.`);
				} else {
					logger.error(`[${provider.id}] IMAP session error.`, error);
					const delay = await backoff.wait();
					logger.info(
						`[${provider.id}] Reconnecting after ${delay}ms backoff.`,
					);
					try {
						await client.logout();
					} catch {}
					try {
						client.close();
					} catch {}
					continue;
				}
			} finally {
				try {
					await client.logout();
				} catch {}
				try {
					client.close();
				} catch {}
			}

			if (!stopRequested) {
				const delay = await backoff.wait();
				logger.info(
					`[${provider.id}] Connection closed. Reconnecting after ${delay}ms.`,
				);
			}
		}
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}
