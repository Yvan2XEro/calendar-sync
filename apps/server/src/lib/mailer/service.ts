import { Buffer } from "node:buffer";

import { Resend } from "resend";

import type { MailerMessage, MailerSendResult } from "./types";

const resendApiKey = process.env.RESEND_API_KEY;

const resendClient = resendApiKey ? new Resend(resendApiKey) : null;

function resolveFromAddress(): string | null {
	const configured = process.env.TRANSACTIONAL_EMAIL_FROM;
	if (configured && configured.trim().length > 0) {
		return configured.trim();
	}
	const fallbackAddress = process.env.EMAIL_FROM_ADDRESS?.trim();
	if (!fallbackAddress) return null;
	const fallbackName = process.env.EMAIL_FROM_NAME?.trim();
	return fallbackName
		? `${fallbackName} <${fallbackAddress}>`
		: fallbackAddress;
}

const defaultFromAddress = resolveFromAddress();

function mapAttachments(message: MailerMessage) {
	if (!message.attachments?.length) return undefined;
	return message.attachments.map((attachment) => ({
		filename: attachment.filename,
		content:
			typeof attachment.content === "string"
				? Buffer.from(attachment.content, "base64")
				: attachment.content,
		contentType: attachment.contentType,
	}));
}

export async function sendTransactionalEmail(
	message: MailerMessage,
): Promise<MailerSendResult> {
	if (!resendClient) {
		return { success: false, error: "Resend API key is not configured" };
	}
	const from = defaultFromAddress;
	if (!from) {
		return {
			success: false,
			error: "Transactional From address is not configured",
		};
	}

	try {
		const response = await resendClient.emails.send({
			from,
			to: message.to,
			subject: message.subject,
			html: message.html,
			text: message.text,
			replyTo: message.replyTo ?? undefined,
			attachments: mapAttachments(message),
		});
		if (response.error) {
			return {
				success: false,
				error: response.error.message ?? "Email provider returned an error",
			};
		}
		return { success: true, id: response.data?.id ?? null };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown mailer error",
		};
	}
}
