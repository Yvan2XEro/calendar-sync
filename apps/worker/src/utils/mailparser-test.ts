import { faker } from "@faker-js/faker";
import type { WorkerLogger } from "../services/log";
import { type EventSqlInsert, EventSqlInsertSchema } from "./mailparser";

type ExtractEventInput = {
	provider_id: string;
	text?: string;
	html?: string;
	messageId?: string;
};

function hashStringToInt(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
	}
	return (h >>> 0) % 2_147_483_647;
}

export async function extractEventFromEmailFake(
	input: ExtractEventInput,
	_options?: { logger?: WorkerLogger },
): Promise<EventSqlInsert | null> {
	const { provider_id, messageId } = input;

	const seedBasis =
		messageId ??
		input.text?.slice(0, 64) ??
		input.html?.slice(0, 64) ??
		`${provider_id}-${Date.now()}`;
	faker.seed(hashStringToInt(seedBasis));

	const kinds = ["Webinar", "Workshop", "Conference", "Meetup", "Deadline"];
	const kind = faker.helpers.arrayElement(kinds);
	const baseTitle = faker.company.catchPhraseNoun();
	const title = `${kind}: ${baseTitle.charAt(0).toUpperCase()}${baseTitle.slice(1)}`;

	const isAllDay = faker.datatype.boolean({ probability: 0.15 });
	const start = faker.date.soon({ days: 30 });
	let end = faker.date.soon({ days: 1, refDate: start });
	if (isAllDay) {
		const s = new Date(start);
		s.setUTCHours(0, 0, 0, 0);
		const e = new Date(s);
		e.setUTCDate(e.getUTCDate() + 1);
		end = e;
	} else if (end <= start) {
		end = new Date(start.getTime() + 60 * 60 * 1000);
	}

	const maybeUrl = faker.datatype.boolean({ probability: 0.6 })
		? `https://www.${faker.internet.domainName()}/${faker.word.noun()}-${faker.number.int({ min: 100, max: 999 })}`
		: null;

	const locations = [
		`${faker.location.city()}, ${faker.location.country()}`,
		`${faker.location.streetAddress()}, ${faker.location.city()}`,
		"Online",
		null,
	];
	const location = faker.helpers.arrayElement(locations);

	const payload = {
		provider_id,
		flag_id: null,
		external_id: messageId ?? faker.string.uuid(),
		title,
		description: faker.lorem.sentences({ min: 1, max: 3 }),
		location,
		url: maybeUrl,
		start_at: start.toISOString(),
		end_at: end.toISOString(),
		is_all_day: isAllDay,
		is_published: faker.datatype.boolean({ probability: 0.2 }),
		metadata: {
			source: "faker",
			organizer: faker.person.fullName(),
			contact_email: faker.internet.email(),
			generated_at: new Date().toISOString(),
			seed: seedBasis,
		},
		priority: faker.number.int({ min: 1, max: 5 }),
	};

	const parsed = EventSqlInsertSchema.safeParse(payload);
	if (!parsed.success) return null;
	if (parsed.data.end_at) {
		const endAt = new Date(parsed.data.end_at);
		if (endAt < new Date(parsed.data.start_at)) return null;
	}

	return parsed.data;
}
