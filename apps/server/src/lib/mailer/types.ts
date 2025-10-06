import type { Attachment } from "resend";

import type { eventEmailStatus, eventEmailType } from "@/db/schema/app";

export type EmailDeliveryType = (typeof eventEmailType.enumValues)[number];
export type EmailDeliveryStatus = (typeof eventEmailStatus.enumValues)[number];

export type MailerAttachment = Pick<
	Attachment,
	"content" | "filename" | "contentType"
>;

export type MailerMessage = {
	to: string;
	subject: string;
	html: string;
	text: string;
	replyTo?: string | null;
	attachments?: MailerAttachment[];
};

export type MailerSendResult =
	| { success: true; id?: string | null }
	| { success: false; error: string | null };
