import { decryptSecret } from "@/lib/crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { processInboundEvent } from "@/lib/flow-engine";
import { log } from "@/lib/logger";
import { acquireSendSlot } from "@/lib/rate-limit";
import {
  findContactByTelegram,
  loadActiveFlows,
  loadActiveSession,
  persistContact,
  persistSession,
  saveMessage,
} from "@/lib/store";
import {
  answerCallbackQuery,
  sendMessage,
  type TelegramUpdate,
} from "@/lib/telegram";

export async function processTelegramUpdate(botId: string, update: TelegramUpdate) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot) {
    log.warn("Webhook for unknown bot");
    return;
  }

  const from = update.message?.from ?? update.callback_query?.from;
  if (!from || from.is_bot) return;

  const token = decryptSecret(bot.tokenEncrypted);
  const telegramUserId = String(from.id);
  const text = update.message?.text ?? null;
  const callbackData = update.callback_query?.data ?? null;

  if (update.callback_query?.id) {
    try {
      await answerCallbackQuery(token, update.callback_query.id);
    } catch (error) {
      log.warn("answerCallbackQuery failed", error instanceof Error ? error.message : error);
    }
  }

  const existing = await findContactByTelegram(botId, telegramUserId);
  const session = existing ? await loadActiveSession(existing.id) : null;
  const flows = await loadActiveFlows(botId);
  const result = processInboundEvent({
    contact: existing,
    session,
    flows,
    event: {
      telegramUserId,
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      languageCode: from.language_code ?? null,
      text,
      callbackData,
      telegramMessageId: update.message ? String(update.message.message_id) : null,
    },
  });

  await persistContact(botId, result.contact);
  await persistSession(result.contact.id, result.session);

  if (result.inboundSaved && (text || callbackData)) {
    await saveMessage({
      botId,
      contactId: result.contact.id,
      direction: "inbound",
      source: "user",
      body: text ?? `[button] ${callbackData}`,
      telegramMessageId: update.message ? String(update.message.message_id) : null,
    });
  }

  for (const reply of result.replies) {
    await acquireSendSlot(botId, telegramUserId);
    const sent = await sendMessage(token, telegramUserId, reply.text, reply.buttons);
    await saveMessage({
      botId,
      contactId: result.contact.id,
      direction: "outbound",
      source: reply.source === "flow" ? "flow" : "agent",
      body: reply.text,
      telegramMessageId: String(sent.message_id),
    });
  }
}
