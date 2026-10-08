import { requireBotAccess } from "@/lib/auth";
import { json, fail } from "@/lib/http";
import type { InboxThread } from "@/lib/inbox";
import { displayName } from "@/lib/lead-capture";
import { listInbox, loadContactRecord } from "@/lib/store";

export async function inboxThreads(botId: string): Promise<InboxThread[]> {
  const rows = await listInbox(botId);
  return Promise.all(
    rows.map(async (row) => {
      const contact = await loadContactRecord(row.contact.id);
      return {
        contactId: row.contact.id,
        name: contact ? displayName(contact) : row.contact.telegramUserId,
        username: row.contact.username,
        status: (contact?.inboxStatus ?? row.contact.inboxStatus) === "closed" ? "closed" : "open",
        lastAt: row.lastAt.toISOString(),
        lastBody: row.lastBody ?? "",
        lastDirection: row.lastDirection === "inbound" || row.lastDirection === "outbound" ? row.lastDirection : null,
        unread: row.unread,
        tags: contact?.tags ?? [],
      };
    }),
  );
}

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    return json({ threads: await inboxThreads(botId) });
  } catch (error) {
    return fail(error);
  }
}
