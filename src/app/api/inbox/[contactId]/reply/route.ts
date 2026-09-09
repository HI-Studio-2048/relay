import { eq } from "drizzle-orm";
import { accountFromRow, sendChannelReply } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { bots, contacts } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { acquireSendSlot } from "@/lib/rate-limit";
import { pauseContactAutomation, saveMessage } from "@/lib/store";

export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const body = await readJson<{ text?: string }>(request);
    if (!body.text?.trim()) return json({ error: "Message text is required" }, 400);
    const db = await getDb();
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!contact) return json({ error: "Contact not found" }, 404);
    const [bot] = await db.select().from(bots).where(eq(bots.id, contact.botId)).limit(1);
    if (!bot) return json({ error: "Bot not found" }, 404);
    await acquireSendSlot(contact.botId, contact.telegramUserId);
    const sent = await sendChannelReply(accountFromRow(bot), contact.telegramUserId, {
      text: body.text.trim(),
      source: "agent",
    });
    await saveMessage({
      botId: contact.botId,
      contactId,
      direction: "outbound",
      source: "agent",
      body: body.text.trim(),
      telegramMessageId: sent.message_id || null,
    });
    await pauseContactAutomation(contactId);
    return json({ ok: true, telegramMessageId: sent.message_id });
  } catch (error) {
    return fail(error, "Could not send reply");
  }
}
