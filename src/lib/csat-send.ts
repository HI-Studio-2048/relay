import { and, desc, eq, gte } from "drizzle-orm";
import { accountFromRow, channelTarget, sendChannelReply } from "@/lib/channels";
import { CSAT_OPTIONS, readCsat } from "@/lib/csat";
import { getDb } from "@/lib/db";
import { bots, contacts, messages } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { saveMessage } from "@/lib/store";

/**
 * Ask for a rating after a teammate closes a conversation they took part in (last 7 days). Best
 * effort: a failed send never blocks closing the conversation.
 */
export async function sendCsatSurvey(contactId: string) {
  try {
    const db = await getDb();
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!contact || contact.unsubscribed) return false;
    const [bot] = await db.select().from(bots).where(eq(bots.id, contact.botId)).limit(1);
    const csat = readCsat(bot?.settings);
    if (!bot || !csat.enabled) return false;
    const [agentReply] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.contactId, contactId), eq(messages.source, "agent"), gte(messages.createdAt, new Date(Date.now() - 7 * 86_400_000))))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (!agentReply) return false;
    const sent = await sendChannelReply(accountFromRow(bot), channelTarget(contact), {
      text: csat.question,
      buttons: CSAT_OPTIONS.map((option) => ({ text: option.label, data: `csat:${option.score}` })),
      source: "agent",
    });
    await saveMessage({
      botId: bot.id,
      contactId,
      direction: "outbound",
      source: "flow",
      body: `${csat.question} [rating request]`,
      telegramMessageId: sent.message_id || null,
    });
    return true;
  } catch (error) {
    log.warn("CSAT survey failed", error instanceof Error ? error.message : error);
    return false;
  }
}
