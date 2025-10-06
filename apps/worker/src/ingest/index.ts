import type { EventSqlInsert } from "../utils/mailparser";
import { scoreConfidence } from "./confidence";
import { detectDuplicate } from "./duplicate-detector";
import { runSpamFilter } from "./spam-filter";
import type {
	IngestDecision,
	IngestMetadataSnapshot,
	IngestPipelineInput,
} from "./types";

function buildExtractionSnapshot(
	extraction: EventSqlInsert,
): Record<string, unknown> {
	return {
		title: extraction.title,
		description: extraction.description ?? null,
		location: extraction.location ?? null,
		url: extraction.url ?? null,
		start_at: extraction.start_at,
		end_at: extraction.end_at ?? null,
		is_all_day: extraction.is_all_day ?? false,
		is_published: extraction.is_published ?? false,
		priority: extraction.priority ?? 3,
		flag_id: extraction.flag_id ?? null,
		external_id: extraction.external_id ?? null,
		metadata: extraction.metadata ?? {},
	} satisfies Record<string, unknown>;
}

export async function runIngestPipeline({
	context,
	extraction,
}: IngestPipelineInput): Promise<IngestDecision> {
	const spam = runSpamFilter(extraction, context);
	const duplicate = await detectDuplicate(extraction, context);
	const confidence = scoreConfidence(extraction, spam, duplicate, context);

	let proceed = true;
	let skipReason: string | undefined;

	if (duplicate.duplicate) {
		proceed = false;
		skipReason = "duplicate";
	}

	const baseStatus = extraction.status ?? "pending";
	let status = baseStatus;
	let autoApproved = status === "approved";
	let autoApprovalReason: string | null = null;

	if (context.provider.trusted) {
		if (confidence.autoApprove) {
			status = "approved";
			autoApproved = true;
			autoApprovalReason = "trusted_provider_high_confidence";
		} else {
			status = "pending";
			autoApproved = false;
			autoApprovalReason = "confidence_low";
		}
	} else {
		if (status === "approved" && !confidence.autoApprove) {
			status = "pending";
			autoApproved = false;
			autoApprovalReason = "confidence_low";
		}
	}

	if (spam.flagged && autoApproved) {
		// Safety net: do not allow auto approval on spam even if trusted.
		status = "pending";
		autoApproved = false;
		autoApprovalReason = "spam_detected";
	}

	const snapshot: IngestMetadataSnapshot = {
		spam,
		duplicate,
		confidence,
		extraction: buildExtractionSnapshot(extraction),
	};

	const metadataPatch: Record<string, unknown> = {
		ingest_pipeline: {
			...snapshot,
			decision: {
				status,
				auto_approved: autoApproved,
				reason: autoApprovalReason,
				skipped: !proceed,
				skip_reason: skipReason ?? null,
			},
		},
	};

	return {
		proceed,
		status,
		autoApproved,
		autoApprovalReason,
		skipReason,
		duplicateEventId: duplicate.existingEventId ?? null,
		metadataPatch,
	} satisfies IngestDecision;
}
