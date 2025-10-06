import type { EventSqlInsert } from "../utils/mailparser";
import type { IngestContext, SpamCheckResult } from "./types";

const spamKeywords = [
	"unsubscribe",
	"lottery",
	"sweepstakes",
	"crypto",
	"bet now",
	"guaranteed winner",
	"adult",
	"viagra",
	"pills",
	"free money",
];

const suspiciousPhrases = [
	"not an event",
	"special promotion",
	"buy now",
	"limited time offer",
	"sponsored content",
];

const suspiciousDomains = ["example-spam.com", "spammy.biz", "clickme.net"];

function containsSpamKeyword(value: string | null | undefined): boolean {
	if (!value) return false;
	const normalized = value.toLowerCase();
	return spamKeywords.some((keyword) => normalized.includes(keyword));
}

function containsSuspiciousPhrase(value: string | null | undefined): boolean {
	if (!value) return false;
	const normalized = value.toLowerCase();
	return suspiciousPhrases.some((phrase) => normalized.includes(phrase));
}

function hasSuspiciousDomain(url: string | null | undefined): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return suspiciousDomains.some((domain) => parsed.hostname.includes(domain));
	} catch {
		return false;
	}
}

export function runSpamFilter(
	extraction: EventSqlInsert,
	context: IngestContext,
): SpamCheckResult {
	const reasons: string[] = [];

	if (containsSpamKeyword(extraction.title)) {
		reasons.push("title_contains_spam_keyword");
	}

	if (containsSpamKeyword(extraction.description)) {
		reasons.push("description_contains_spam_keyword");
	}

	if (containsSuspiciousPhrase(extraction.description)) {
		reasons.push("description_contains_suspicious_phrase");
	}

	if (hasSuspiciousDomain(extraction.url ?? null)) {
		reasons.push("suspicious_url_domain");
	}

	const flagged = reasons.length > 0;
	if (flagged) {
		context.metrics.incrementCounter("worker_ingest_spam_detected_total", 1, {
			provider_id: context.provider.id,
			mailbox: context.message.mailbox,
		});
	}

	if (flagged) {
		context.logger.debug("Spam filter flagged extraction", {
			mailbox: context.message.mailbox,
			uid: context.message.uid,
			reasons,
		});
	}

	return {
		flagged,
		reasons,
		scorePenalty: flagged ? 0.4 : 0,
	} satisfies SpamCheckResult;
}
