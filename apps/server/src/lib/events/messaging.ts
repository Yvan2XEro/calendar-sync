export const DEFAULT_REMINDER_CADENCE_HOURS = [24, 1] as const;

export type EventMessagingSettings = {
	confirmationSubject?: string | null;
	reminderSubject?: string | null;
	updateSubject?: string | null;
	cancellationSubject?: string | null;
	followUpSubject?: string | null;
	replyToEmail?: string | null;
	reminderCadenceHours: number[];
};

type RawMetadata = Record<string, unknown> | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function normalizeReminderCadence(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	const unique = new Set<number>();
	for (const entry of value) {
		const numeric = typeof entry === "number" ? entry : Number(entry);
		if (!Number.isFinite(numeric)) continue;
		const rounded = Math.trunc(numeric);
		if (rounded <= 0 || rounded > 720) continue;
		unique.add(rounded);
	}
	return Array.from(unique).sort((a, b) => a - b);
}

export function parseEventMessagingSettings(
	metadata: RawMetadata,
): EventMessagingSettings {
	const root =
		isRecord(metadata) && isRecord(metadata.messaging)
			? (metadata.messaging as Record<string, unknown>)
			: {};

	const reminderCadence = normalizeReminderCadence(root.reminderCadenceHours);
	const cadence =
		reminderCadence.length > 0
			? reminderCadence
			: [...DEFAULT_REMINDER_CADENCE_HOURS];

	return {
		confirmationSubject: normalizeString(root.confirmationSubject),
		reminderSubject: normalizeString(root.reminderSubject),
		updateSubject: normalizeString(root.updateSubject),
		cancellationSubject: normalizeString(root.cancellationSubject),
		followUpSubject: normalizeString(root.followUpSubject),
		replyToEmail: normalizeString(root.replyToEmail),
		reminderCadenceHours: cadence,
	};
}

export function buildMessagingMetadata(
	settings: Partial<EventMessagingSettings>,
): Record<string, unknown> | undefined {
	const next: Record<string, unknown> = {};
	if (settings.confirmationSubject)
		next.confirmationSubject = settings.confirmationSubject;
	if (settings.reminderSubject) next.reminderSubject = settings.reminderSubject;
	if (settings.updateSubject) next.updateSubject = settings.updateSubject;
	if (settings.cancellationSubject)
		next.cancellationSubject = settings.cancellationSubject;
	if (settings.followUpSubject) next.followUpSubject = settings.followUpSubject;
	if (settings.replyToEmail) next.replyToEmail = settings.replyToEmail;
	if (
		settings.reminderCadenceHours &&
		settings.reminderCadenceHours.length > 0
	) {
		next.reminderCadenceHours = settings.reminderCadenceHours;
	}
	return Object.keys(next).length > 0 ? { messaging: next } : undefined;
}

export function parseReminderCadenceInput(value: string): number[] {
	if (!value) return [];
	const parts = value
		.split(/[,\s]+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	const unique = new Set<number>();
	for (const part of parts) {
		const numeric = Number(part);
		if (!Number.isFinite(numeric)) continue;
		const rounded = Math.trunc(numeric);
		if (rounded <= 0 || rounded > 720) continue;
		unique.add(rounded);
	}
	return Array.from(unique).sort((a, b) => a - b);
}

export function formatReminderCadenceInput(values: Iterable<number>): string {
	const unique = Array.from(new Set(values));
	if (!unique.length) return "";
	return unique.sort((a, b) => a - b).join(", ");
}
