import { eq } from "drizzle-orm";
import { decryptBotToken } from "@/lib/bots";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { acquireSendSlot } from "@/lib/rate-limit";
import { saveMessage } from "@/lib/store";
import { sendMessage } from "@/lib/telegram";

export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const body = await readJson<{ text?: string }>(request);
    if (!body.text?.trim()) return json({ error: "Message text is required" }, 400);
    const db = await getDb();
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!contact) return json({ error: "Contact not found" }, 404);
    const token = await decryptBotToken(contact.botId);
    await acquireSendSlot(contact.botId, contact.telegramUserId);
    const sent = await sendMessage(token, contact.telegramUserId, body.text.trim());
    await saveMessage({
      botId: contact.botId,
      contactId,
      direction: "outbound",
      source: "agent",
      body: body.text.trim(),
      telegramMessageId: String(sent.message_id),
    });
    return json({ ok: true, telegramMessageId: sent.message_id });
  } catch (error) {
    return fail(error, "Could not send reply");
  }
}
