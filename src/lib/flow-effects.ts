import { channelTarget, sendChannelTyping, channelOf, type ChannelAccount } from "@/lib/channels";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { adminTelegramChatId } from "@/lib/env";
import { log } from "@/lib/logger";
import { saveMessage } from "@/lib/store";
import { sendMessage } from "@/lib/telegram";
import type { ContactRecord, FlowEffect } from "@/lib/types";

import { interpolateTemplate } from "@/lib/template";

export { interpolateTemplate };

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

      if (effect.type === "goal") {
        const { recordFlowEvents } = await import("@/lib/analytics");
        await recordFlowEvents([
          { botId: input.botId, flowId: effect.flowId, stepId: effect.stepId, contactId: input.contact.id, kind: "goal", name: effect.name, value: effect.value ?? null },
        ]);
        const { runRules } = await import("@/lib/rules");
        await runRules(input.botId, input.contact, [{ type: "goal_reached", value: effect.name }]);
        const { emitWebhookSoon, publicContact } = await import("@/lib/developer");
        emitWebhookSoon(input.botId, "goal.reached", {
          contact: publicContact(input.contact),
          goal: { name: effect.name, value: effect.value ?? null, flowId: effect.flowId },
        });
        continue;
      }

      if (effect.type === "ai_turn") {
        // Lazy import: the AI runtime re-enters the engine and dispatcher, which import this file.
        const { runAiTurn } = await import("@/lib/ai-runtime");
        await runAiTurn({ botId: input.botId, account: input.account, contactId: input.contact.id, flowId: effect.flowId, stepId: effect.stepId });
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
