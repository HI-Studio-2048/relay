import { eq } from "drizzle-orm";
import { channelTarget, sendChannelTyping, channelOf, type ChannelAccount } from "@/lib/channels";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { adminTelegramChatId, publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";
import { saveMessage } from "@/lib/store";
import { sendMessage } from "@/lib/telegram";
import type { ContactRecord, FlowEffect } from "@/lib/types";

import { interpolateTemplate } from "@/lib/template";

export { interpolateTemplate };

/** Admin alerts always go out over Telegram: the first connected Telegram bot delivers them. */
/** Team alerts: a Slack / Discord / Teams-compatible incoming webhook stored per account. */
export function readAlerts(settings: Record<string, unknown> | null | undefined): { webhookUrl: string } {
  const raw = (settings?.alerts ?? {}) as { webhookUrl?: unknown };
  const url = typeof raw.webhookUrl === "string" ? raw.webhookUrl.trim() : "";
  // Plain http only outside production, so a local receiver can be wired up while developing.
  const allowed = /^https:\/\//i.test(url) || (process.env.NODE_ENV !== "production" && /^http:\/\//i.test(url));
  return { webhookUrl: allowed ? url.slice(0, 500) : "" };
}

/** Body shape per service: Discord wants `content`, Slack and most others accept `text`. */
export function alertPayload(url: string, text: string, link?: string | null) {
  const full = link ? `${text}\n${link}` : text;
  return /discord(app)?\.com\/api\/webhooks/i.test(url) ? { content: full.slice(0, 1900) } : { text: full.slice(0, 3000) };
}

async function postAlert(botId: string, text: string, link?: string | null) {
  const db = await getDb();
  const [bot] = await db.select({ settings: bots.settings }).from(bots).where(eq(bots.id, botId)).limit(1);
  const { webhookUrl } = readAlerts(bot?.settings);
  if (!webhookUrl) return false;
  const { safeRequest } = await import("@/lib/web-import");
  const response = await safeRequest({
    url: webhookUrl,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(alertPayload(webhookUrl, text, link)),
  });
  const ok = response.status >= 200 && response.status < 300;
  if (!ok) log.warn("Team alert webhook failed", response.status);
  return ok;
}

/**
 * Tell the team: the account's alert webhook (Slack, Discord…) when set, plus the Telegram admin chat
 * when configured. Pass the contact to include a link to their conversation.
 */
export async function notifyAdmin(text: string, target?: { botId: string; contactId?: string | null }) {
  let delivered = false;
  if (target?.botId) {
    const origin = publicUrl();
    const link = origin && target.contactId ? `${origin}/inbox/${target.contactId}` : null;
    delivered = await postAlert(target.botId, text, link).catch((error) => {
      log.warn("Team alert failed", error instanceof Error ? error.message : error);
      return false;
    });
  }
  const adminChat = adminTelegramChatId();
  if (!adminChat) return delivered;
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
        // Never let a flow call into the server's own network (SSRF): the dialled address is checked.
        const { safeRequest } = await import("@/lib/web-import");
        const response = await safeRequest({
          url,
          method: effect.method === "GET" ? "GET" : "POST",
          headers: effect.method === "GET" ? {} : { "content-type": "application/json" },
          body: effect.method === "GET" ? undefined : (body ?? "{}"),
        });
        if (response.status < 200 || response.status >= 300) {
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
      await notifyAdmin(text, { botId: input.botId, contactId: input.contact.id });
    } catch (error) {
      log.warn("Flow effect failed", error instanceof Error ? error.message : error);
    }
  }
}
