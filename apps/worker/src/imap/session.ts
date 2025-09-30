import type { FetchMessageObject } from "imapflow";
import { ImapFlow } from "imapflow";
import type { ParsedMail } from "mailparser";
import { simpleParser } from "mailparser";
import type { WorkerConfig } from "../config/env";
import { insertEvent } from "../db/events";
import { getProviderCursor, setProviderCursor } from "../db/providers";
import { createBackoff } from "../services/backoff";
import type { WorkerLogger } from "../services/log";
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
	logger: WorkerLogger;
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
	log: WorkerLogger,
): Promise<boolean> {
	const uid = message.uid;
	if (!uid) return false;

	const source = message.source;
	if (!source) {
		log.warn("Message missing raw source", { uid, mailbox });
		return false;
	}

	let parsed: ParsedMail;
	try {
		parsed = await simpleParser(source as Buffer);
	} catch (error) {
		log.error("Failed to parse message", { uid, mailbox, error });
		return false;
	}

	const messageId =
		parsed.messageId || message.envelope?.messageId || undefined;
	const text = parsed.text ?? undefined;
	const html = safeHtmlToString(parsed.html ?? undefined);
	const internalDate = normalizeInternalDate(message.internalDate);

	const extraction = await extractEvent(
		{
			provider_id: provider.id,
			text,
			html,
			messageId,
		},
		{ logger: log },
	);

	if (!extraction) {
		log.debug("Message did not produce event payload", { uid, mailbox });
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
        } as Record<string, unknown>;

        const status = provider.trusted ? "approved" : extraction.status ?? "pending";

        if (provider.trusted) {
                metadata.auto_approval = {
                        reason: "trusted_provider",
                        provider_id: provider.id,
                        at: new Date().toISOString(),
                } satisfies Record<string, unknown>;
        }

        const inserted = await insertEvent({
                ...extraction,
                status,
                external_id: externalId,
                metadata,
        });

	if (!inserted) {
		log.debug("Event already existed", {
			externalId,
			uid,
			mailbox,
		});
		return false;
	}

	log.info("Inserted event", {
		eventId: inserted.id,
		uid,
		mailbox,
	});
	return true;
}

export async function runProviderSession(
	provider: ProviderRecord,
	options: ProviderSessionOptions,
): Promise<void> {
	const imapConfig = provider.config.imap;
	if (!imapConfig) {
		options.logger.warn("Missing IMAP configuration");
		return;
	}

	const mailbox = resolveMailbox(imapConfig);
	const { workerConfig, signal } = options;
	const sessionLogger = options.logger;
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
				sessionLogger.error("IMAP client error", { error: err });
			});

			try {
				sessionLogger.info("Connecting to IMAP host", {
					host: imapConfig.host,
					port: imapConfig.port,
					secure: imapConfig.secure,
				});
				await client.connect();
				const mailboxInfo = await client.mailboxOpen(mailbox);
				sessionLogger.info("Mailbox opened", {
					mailbox,
					exists: mailboxInfo.exists,
					uidNext: mailboxInfo.uidNext ?? null,
				});

				const storedCursor = await getProviderCursor(provider.id);
				let lastSeenUid: number;
				if (storedCursor == null) {
					lastSeenUid = (mailboxInfo.uidNext ?? 1) - 1;
					await setProviderCursor(provider.id, lastSeenUid);
					sessionLogger.debug("Initialized cursor", {
						cursor: lastSeenUid,
					});
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
							const inserted = await handleMessage(
								provider,
								mailbox,
								message,
								sessionLogger,
							);
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
						sessionLogger.info("Processed new messages", {
							processed,
							cursor: lastSeenUid,
						});
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
						sessionLogger.error("Error processing new messages", {
							error,
						});
					});
				});

				await triggerProcess(true);

				while (!stopRequested && client.usable) {
					try {
						await client.idle();
					} catch (error) {
						if (stopRequested) break;
						sessionLogger.warn("IDLE loop interrupted", {
							error,
						});
					}

					await triggerProcess(false);

					if (Date.now() - lastPollAt >= workerConfig.pollIntervalMs) {
						await triggerProcess(true);
					}
				}

				backoff.reset();
				if (stopRequested) {
					sessionLogger.info("Session stopping");
				}
			} catch (error) {
				if (stopRequested) {
					sessionLogger.debug("Session aborted");
				} else {
					sessionLogger.error("IMAP session error", { error });
					const delay = await backoff.wait();
					sessionLogger.info("Reconnecting after backoff", {
						delayMs: delay,
					});
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
				sessionLogger.info("Connection closed. Reconnecting", {
					delayMs: delay,
				});
			}
		}
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}
