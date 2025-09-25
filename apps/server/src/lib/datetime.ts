import { format } from "date-fns";

export function formatDateTimeLocal(value: string | Date | null | undefined) {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function formatDisplayDate(value: string | Date | null | undefined) {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return format(date, "MMM d, yyyy p");
}
