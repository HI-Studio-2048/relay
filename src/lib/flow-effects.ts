import { channelTarget, sendChannelTyping, channelOf, type ChannelAccount } from "@/lib/channels";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { adminTelegramChatId } from "@/lib/env";
import { log } from "@/lib/logger";
import { saveMessage } from "@/lib/store";
import { sendMessage } from "@/lib/telegram";
import type { ContactRecord, FlowEffect } from "@/lib/types";

/**
 * Personalization. ManyChat names ({{first_name}}, {{last_name}}, {{full_name}}) plus Relay's
 * {{name}} / {{field:key}}, any custom field by bare key ({{company}}), and a fallback after a pipe
 * for empty values: {{first_name|there}}.
 */
export function interpolateTemplate(template: string, contact: ContactRecord, extra: Record<string, string> = {}): string {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const builtins: Record<string, string> = {
    name,
    full_name: name,
    first_name: contact.firstName ?? "",
    last_name: contact.lastName ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    username: contact.username ?? "",
    telegram_id: contact.telegramUserId,
    user_id: contact.telegramUserId,
    platform: contact.platform ?? "",
    ...extra,
  };
  return template.replace(/\{\{\s*([a-z0-9_:.]+)\s*(?:\|([^}]*))?\}\}/gi, (match, rawKey: string, fallback?: string) => {
    const key = rawKey.toLowerCase();
    let value: string | undefined;
    if (key.startsWith("field:")) value = contact.customFields[rawKey.slice("field:".length)] ?? "";
    else if (key in builtins) value = builtins[key];
    else if (rawKey in contact.customFields) value = contact.customFields[rawKey];
    else if (fallback === undefined) return match;
    return value?.trim() ? value : (fallback ?? "").trim();
  });
}

/** Admin alerts always go out over Telegram: the first connected Telegram bot delivers them. */
export async function notifyAdmin(text: string) {
  const adminChat = adminTelegramChatId();
  if (!adminChat) return false;
  const db = await getDb();
  const rows = await db.select().from(bots);
  const telegram = rows.find((row) => channelOf(row.channel) === "telegram");
  if (!telegram) {
    log.warn("Admin notify skipped: no Telegram bot connected to deliver it");
    return false;
  }
  await sendMessage(decryptSecret(telegram.tokenEncrypted), adminChat, text);
  return true;
}

export async function applyFlowEffects(input: {
  botId: string;
  account: ChannelAccount;
  contact: ContactRecord;
  effects: FlowEffect[];
}) {
  for (const effect of input.effects) {
    try {
      if (effect.type === "http") {
        const url = interpolateTemplate(effect.url, input.contact).trim();
        if (!/^https:\/\//i.test(url)) {
          log.warn("HTTP step skipped: URL must be https");
          continue;
        }
        const body = effect.body ? interpolateTemplate(effect.body, input.contact) : undefined;
        const response = await fetch(url, {
          method: effect.method,
          headers: effect.method === "POST" ? { "content-type": "application/json" } : undefined,
          body: effect.method === "POST" ? (body ?? "{}") : undefined,
        });
        if (!response.ok) {
          log.warn("HTTP step failed", response.status, url);
        }
        continue;
      }

      if (effect.type === "typing") {
        await sendChannelTyping(input.account, channelTarget(input.contact));
        continue;
      }

      const text = interpolateTemplate(effect.text, input.contact).trim() || "New lead from Relay";
      await saveMessage({
        botId: input.botId,
        contactId: input.contact.id,
        direction: "outbound",
        source: "flow",
        body: `Admin notify: ${text}`,
      });
      await notifyAdmin(text);
    } catch (error) {
      log.warn("Flow effect failed", error instanceof Error ? error.message : error);
    }
  }
}
