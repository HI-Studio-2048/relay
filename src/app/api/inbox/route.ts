import { json, fail } from "@/lib/http";
import { displayName } from "@/lib/lead-capture";
import { listInbox, loadContactRecord } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    const rows = await listInbox(botId);
    const threads = await Promise.all(
      rows.map(async (row) => {
        const contact = await loadContactRecord(row.contact.id);
        return {
          contactId: row.contact.id,
          name: contact ? displayName(contact) : row.contact.telegramUserId,
          username: row.contact.username,
          lastAt: row.lastAt,
        };
      }),
    );
    return json({ threads });
  } catch (error) {
    return fail(error);
  }
}
