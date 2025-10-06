import type { EventSqlInsert } from "../utils/mailparser";
import type {
	ConfidenceResult,
	DuplicateCheckResult,
	IngestContext,
	SpamCheckResult,
} from "./types";

function scoreBase(extraction: EventSqlInsert): number {
	let score = 0.35;

	if (extraction.title.trim().length > 8) score += 0.1;
	if (extraction.description && extraction.description.length > 40)
		score += 0.05;
	if (extraction.location && extraction.location.length > 3) score += 0.1;
	if (extraction.url) score += 0.1;
	if (extraction.end_at) score += 0.05;
	if (extraction.is_published) score += 0.05;

	// Encourage explicit metadata that often comes from high quality sources
	if (extraction.metadata?.organizer) score += 0.05;
	if (extraction.metadata?.source === "email") score += 0.05;

	return score;
}

function clampScore(value: number): number {
	if (Number.isNaN(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function resolveLevel(score: number): "low" | "medium" | "high" {
	if (score >= 0.8) return "high";
	if (score >= 0.6) return "medium";
	return "low";
}

export function scoreConfidence(
	extraction: EventSqlInsert,
	spam: SpamCheckResult,
	duplicate: DuplicateCheckResult,
	context: IngestContext,
): ConfidenceResult {
	const reasons: string[] = [];
	let score = scoreBase(extraction);

	if (spam.flagged) {
		score -= spam.scorePenalty;
		reasons.push("spam_penalty");
	}

	if (duplicate.duplicate) {
		score -= duplicate.scorePenalty;
		reasons.push("duplicate_penalty");
	}

	if (context.provider.trusted) {
		score += 0.05;
	}

	if (context.message.internalDate) {
		score += 0.05;
	}

	score = clampScore(score);
	const level = resolveLevel(score);
	const autoApprove = level === "high" && !spam.flagged && !duplicate.duplicate;

	if (!autoApprove) {
		reasons.push("auto_approval_withheld");
	}

	return {
		score,
		level,
		reasons,
		autoApprove,
	} satisfies ConfidenceResult;
}
