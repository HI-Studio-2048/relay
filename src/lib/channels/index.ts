import { decryptSecret } from "@/lib/crypto";
import type { bots } from "@/lib/db/schema";
import { fetchMetaProfile, parseMetaWebhook, sendMetaReply, sendMetaTyping, type MetaWebhookPayload } from "@/lib/channels/meta";
import { channelOf, type ChannelAccount, type NormalizedInbound, type SentMessage } from "@/lib/channels/types";
import { parseWhatsAppWebhook, sendWhatsAppReply, type WhatsAppWebhookPayload } from "@/lib/channels/whatsapp";
import { answerCallbackQuery, sendChatAction, sendFlowReply, type TelegramUpdate } from "@/lib/telegram";
import type { OutboundReply } from "@/lib/types";

export * from "@/lib/channels/types";
export { ChannelApiError } from "@/lib/channels/meta";

export type BotRow = typeof bots.$inferSelect;

export function accountFromRow(row: BotRow): ChannelAccount {
  return {
    id: row.id,
    channel: channelOf(row.channel),
    token: decryptSecret(row.tokenEncrypted),
    externalAccountId: row.externalAccountId ?? null,
    handle: row.telegramUsername ?? null,
    appSecret: row.appSecretEncrypted ? decryptSecret(row.appSecretEncrypted) : null,
    verifyToken: row.webhookSecret,
  };
}

/** Send one engine reply on whatever channel the account lives on. */
export async function sendChannelReply(account: ChannelAccount, to: string, reply: OutboundReply): Promise<SentMessage> {
  if (account.channel === "telegram") {
    const sent = await sendFlowReply(account.token, to, reply);
    return { message_id: String(sent.message_id) };
  }
  if (account.channel === "whatsapp") return sendWhatsAppReply(account, to, reply);
  return sendMetaReply(account, to, reply);
}

export async function sendChannelTyping(account: ChannelAccount, to: string) {
  if (account.channel === "telegram") return void (await sendChatAction(account.token, to, "typing"));
  if (account.channel === "whatsapp") return;
  await sendMetaTyping(account, to);
}

export async function ackChannelCallback(account: ChannelAccount, inbound: NormalizedInbound) {
  if (account.channel === "telegram" && inbound.ackCallbackId) {
    await answerCallbackQuery(account.token, inbound.ackCallbackId);
  }
}

/** Fill in a first name for a new contact when the platform does not send it inline. */
export async function lookupChannelProfile(account: ChannelAccount, externalUserId: string) {
  if (account.channel === "instagram" || account.channel === "messenger") {
    return fetchMetaProfile(account, externalUserId);
  }
  return null;
}

export function parseTelegramUpdate(update: TelegramUpdate): NormalizedInbound[] {
  const from = update.message?.from ?? update.callback_query?.from;
  if (!from || from.is_bot) return [];
  return [
    {
      externalUserId: String(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      languageCode: from.language_code ?? null,
      text: update.message?.text ?? null,
      callbackData: update.callback_query?.data ?? null,
      contactPhone: update.message?.contact?.phone_number ?? null,
      externalMessageId: update.message ? String(update.message.message_id) : null,
      ackCallbackId: update.callback_query?.id ?? null,
    },
  ];
}

/** Normalize any channel's webhook body into engine events. */
export function parseChannelUpdate(account: ChannelAccount, payload: unknown): NormalizedInbound[] {
  if (account.channel === "telegram") return parseTelegramUpdate(payload as TelegramUpdate);
  if (account.channel === "whatsapp") return parseWhatsAppWebhook(payload as WhatsAppWebhookPayload);
  return parseMetaWebhook(payload as MetaWebhookPayload);
}
