import { eq } from "drizzle-orm";
import { AiUnavailableError, assistInbox, readAiSettings } from "@/lib/ai";
import { requireRowAccess } from "@/lib/auth/resources";
import { getDb } from "@/lib/db";
import { bots, contacts } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";
import { listMessages, loadContactRecord } from "@/lib/store";

/** Live Chat copilot: three reply drafts and a one-line read on the conversation. */
export async function POST(_request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    await requireRowAccess("contact", contactId);
    const db = await getDb();
    const [row] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!row) return json({ error: "Contact not found" }, 404);
    const [bot] = await db.select().from(bots).where(eq(bots.id, row.botId)).limit(1);
    const contact = await loadContactRecord(contactId);
    const messages = await listMessages(contactId);
    const assist = await assistInbox({
      settings: readAiSettings(bot?.settings),
      brandName: bot?.name ?? "the business",
      contact: contact!,
      history: messages.map((message) => ({
        direction: message.direction === "outbound" ? "outbound" : "inbound",
        body: message.body,
      })),
    });
    return json({ assist });
  } catch (error) {
    if (error instanceof AiUnavailableError) return json({ error: error.message }, 503);
    return fail(error);
  }
}
