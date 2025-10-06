// @ts-nocheck

import { sql } from "bun";
import { v4 as uuid } from "uuid";
import { insertEvent } from "../db/events";
import { extractEventFromEmail } from "../utils/mailparser";

type ProviderRow = {
	id: string;
	config: Record<string, unknown>;
};

const providers = await sql<ProviderRow[]>`
  SELECT *
  FROM provider
  WHERE status = 'active'`;

const provider = providers?.[0];
if (!provider) {
	console.error("No active provider found.");
	process.exit(1);
}
const result = await extractEventFromEmail({
	provider_id: provider?.id,
	text: "You're invited to the Webinar on Oct 12, 2025 at 3pm GMT+1. Register: https://example.com/webinar/123",
	messageId: "<CAF0...@mail.example.com>",
});

if (result) {
	const inserted = await insertEvent({
		...result,
		id: uuid(),
	});

	if (inserted) {
		const [event] = await sql`
      SELECT *
      FROM event
      WHERE id = ${inserted.id}
    `;
		console.log("Event extracted ✅", event);
	} else {
		console.log("Event already existed, nothing inserted.");
	}
} else {
	console.log("No event detected or validation failed.");
}
