import { ImapFlow } from "imapflow";
import type { AddressObject } from "mailparser";
import { simpleParser } from "mailparser";
import type { Provider, Event } from "../../server/src/db/schema/app";
import { sql } from "bun";

function formatAddrList(input?: AddressObject | AddressObject[] | null) {
  const values = !input
    ? []
    : Array.isArray(input)
      ? input.flatMap((obj) => obj?.value ?? [])
      : (input.value ?? []);

  return values
    .map((a) => `${a?.name ?? ""}${a?.name ? " " : ""}<${a?.address ?? "?"}>`)
    .join(", ");
}
function fmtAddr(addr?: { name?: string; address?: string } | null) {
  if (!addr) return "Unknown";
  if (addr.name && addr.address) return `${addr.name} <${addr.address}>`;
  return addr.address ?? addr.name ?? "Unknown";
}

async function main() {
  const providers = await sql<Provider[]>`
  SELECT *
  FROM provider
  WHERE status = 'active'`;
  const credentiasl = providers?.[0];

  if (!credentiasl) {
    console.error("No active provider found.");
    return;
  }
  const {
    config: {
      imap: {
        host: HOST,
        port: PORT,
        secure: SECURE,
        auth: { user: USER, pass: PASS },
      },
    },
  } = credentiasl;

  const MAILBOX = "INBOX";
  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: SECURE,
    auth: { user: USER, pass: PASS },
    // logger: true,
  });

  client.on("error", (err) => {
    console.error("[IMAP] Error:", err);
  });
  client.on("close", () => {
    console.warn("[IMAP] Connection closed");
  });

  console.log(
    `[IMAP] Connecting to ${HOST}:${PORT} (secure=${SECURE}) as ${USER} ...`,
  );
  await client.connect();

  const mailboxInfo = await client.mailboxOpen(MAILBOX);
  console.log(
    `[IMAP] Mailbox "${MAILBOX}" opened. Exists=${mailboxInfo.exists}, UIDNEXT=${mailboxInfo.uidNext}`,
  );

  let lastSeenUid = (mailboxInfo.uidNext ?? 1) - 1;

  client.on("exists", async (newExists) => {
    try {
      const range = `${lastSeenUid + 1}:*`;
      let gotNew = false;

      for await (const msg of client.fetch(
        { uid: range },
        {
          envelope: true,
          internalDate: true,
          uid: true,
          source: true,
          bodyStructure: true,
        },
      )) {
        lastSeenUid = Math.max(lastSeenUid, msg.uid!);

        const parsed = await simpleParser(msg.source!);

        const subject = parsed.subject || "(no subject)";
        const text = (parsed.text || "").trim();
        const htmlSnippet = parsed.html
          ? String(parsed.html)
              .replace(/<[^>]+>/g, "")
              .slice(0, 200)
          : "";

        const from = parsed.from ? formatAddrList(parsed.from) : "Unknown";

        const toList = formatAddrList(parsed.to);
        const ccList = formatAddrList(parsed.cc);
        const bccList = formatAddrList(parsed.bcc);
        console.log("---- New mail ----");
        console.log("UID:", msg.uid);
        console.log("Subject:", subject);
        console.log("cc:", ccList);
        console.log("From:", from);
        console.log("To:", toList);
        console.log("Bcc:", bccList);
        console.log(
          "Date:",
          msg.internalDate
            ? new Date(msg.internalDate).toISOString()
            : "unknown date",
        );
        if (text) {
          console.log("Text:\n" + text);
        } else if (htmlSnippet) {
          console.log("HTML (snippet):\n" + htmlSnippet);
        } else {
          console.log("(No text/plain or html body found)");
        }
        console.log("------------------");
      }

      if (!gotNew) {
      }
    } catch (err) {
      console.error("[IMAP] exists-handler error:", err);
    }
  });

  console.log("[IMAP] Listening for new messages… (CTRL+C to exit)");

  const shutdown = async () => {
    try {
      console.log("\n[IMAP] Shutting down…");
      await client.logout();
    } catch (e) {
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[IMAP] Fatal:", err);
  process.exit(1);
});
