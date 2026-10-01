import { eq } from "drizzle-orm";
import { apiHandler, ownedContactId } from "@/lib/api-v1";
import { isBroadcastable } from "@/lib/broadcast";
import { accountFromRow, channelTarget, sendChannelReply } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { bots, contacts } from "@/lib/db/schema";
import { interpolateTemplate } from "@/lib/flow-effects";
import { botFieldValues } from "@/lib/template";
import { json, readJson, type RouteParams } from "@/lib/http";
import { acquireSendSlot } from "@/lib/rate-limit";
import { loadContactRecord, saveMessage } from "@/lib/store";

/** POST /api/v1/contacts/:id/messages { text, force? } — send one message now (personalization works). Unsubscribed contacts need force. */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  return apiHandler(request, async (botId) => {
    const id = await ownedContactId(botId, (await context.params).id);
    const body = await readJson<{ text?: string; force?: boolean }>(request);
    const text = body.text?.trim();
    if (!text) return json({ error: "text is required" }, 400);
    const db = await getDb();
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    if (!isBroadcastable(row!) && body.force !== true) {
      return json({ error: "Contact has unsubscribed. Pass force: true for a transactional message." }, 409);
    }
    const record = await loadContactRecord(id);
    const personalized = interpolateTemplate(text, record!, botFieldValues(bot?.settings));
    await acquireSendSlot(botId, row!.telegramUserId);
    const sent = await sendChannelReply(accountFromRow(bot!), channelTarget(row!), { text: personalized, source: "agent" });
    await saveMessage({ botId, contactId: id, direction: "outbound", source: "agent", body: personalized, telegramMessageId: sent.message_id || null });
    return json({ ok: true, message_id: sent.message_id || null });
  });
}
