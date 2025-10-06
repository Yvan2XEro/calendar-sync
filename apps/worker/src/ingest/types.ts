import type { WorkerLogger, WorkerMetrics } from "../services/log";
import type { ProviderRecord } from "../types/provider";
import type { EventSqlInsert } from "../utils/mailparser";

export interface MessageIngestContext {
	uid: number;
	mailbox: string;
	internalDate?: Date | null;
	messageId?: string | null;
}

export interface IngestContext {
	provider: ProviderRecord;
	logger: WorkerLogger;
	metrics: WorkerMetrics;
	message: MessageIngestContext;
}

export interface SpamCheckResult {
	flagged: boolean;
	reasons: string[];
	scorePenalty: number;
}

export interface DuplicateCheckResult {
	duplicate: boolean;
	reasons: string[];
	scorePenalty: number;
	existingEventId?: string | null;
}

export type ConfidenceLevel = "low" | "medium" | "high";

export interface ConfidenceResult {
	score: number;
	level: ConfidenceLevel;
	reasons: string[];
	autoApprove: boolean;
}

export interface IngestMetadataSnapshot {
	spam: SpamCheckResult;
	duplicate: DuplicateCheckResult;
	confidence: ConfidenceResult;
	extraction: Record<string, unknown>;
}

export interface IngestDecision {
	proceed: boolean;
	status: "pending" | "approved" | "rejected";
	autoApproved: boolean;
	autoApprovalReason: string | null;
	skipReason?: string;
	duplicateEventId?: string | null;
	metadataPatch: Record<string, unknown>;
}

export interface IngestPipelineInput {
	context: IngestContext;
	extraction: EventSqlInsert;
}
