import type { Provider, Event } from "../server/src/db/schema/app";
import { v4 as uuid } from "uuid";
import { extractEventFromEmail } from "./utils/mailparser";
import { sql } from "bun";

const providers = await sql<Provider[]>`
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
  const [event] = await sql<Event[]>`
    INSERT INTO event ${sql({
      ...result,
      id: uuid(),
    })}
    RETURNING *
`;
  console.log("Event extracted ✅", event);
} else {
  console.log("No event detected or validation failed.");
}
