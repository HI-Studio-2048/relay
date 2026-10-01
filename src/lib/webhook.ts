import { eq } from "drizzle-orm";
import {
  accountFromRow,
  ackChannelCallback,
  lookupChannelProfile,
  parseChannelUpdate,
  type ChannelAccount,
  type NormalizedInbound,
} from "@/lib/channels";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { replyToZernioComment, sendZernioPrivateReply } from "@/lib/channels/zernio";
import { deliverReplies } from "@/lib/flow-dispatch";
import { interpolateTemplate } from "@/lib/flow-effects";
import { outboundPreview } from "@/lib/media";
import { applyFlowEffects } from "@/lib/flow-effects";
import { processInboundEvent, type EngineResult } from "@/lib/flow-engine";
import { SLUG_PATTERN } from "@/lib/growth";
import {
  applyGrowthAttribution,
  attributedContact,
  findGrowthLink,
  parseStartPayload,
  preferLinkedFlow,
  recordGrowthStart,
} from "@/lib/growth-links";
import { log } from "@/lib/logger";
import {
  findContactByTelegram,
  loadActiveFlows,
  loadActiveSession,
  persistContact,
  persistSession,
  saveMessage,
} from "@/lib/store";
import type { TelegramUpdate } from "@/lib/telegram";
import type { ContactRecord, OutboundReply } from "@/lib/types";

type BotRow = typeof bots.$inferSelect;

/** Entry point for every channel: parse the platform payload, then run each event through the engine. */
export async function processChannelUpdate(botId: string, payload: unknown) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot) {
    log.warn("Webhook for unknown bot");
    return;
  }
  const account = accountFromRow(bot);
  for (const inbound of parseChannelUpdate(account, payload)) {
    try {
      await processInbound(bot, account, inbound);
    } catch (error) {
      log.error("Inbound processing failed", error instanceof Error ? error.message : error);
    }
  }
}

/** Kept for the Telegram webhook route and existing tests. */
export async function processTelegramUpdate(botId: string, update: TelegramUpdate) {
  return processChannelUpdate(botId, update);
}

async function processInbound(bot: BotRow, account: ChannelAccount, inbound: NormalizedInbound) {
  const botId = bot.id;
  if (inbound.ackCallbackId) {
    try {
      await ackChannelCallback(account, inbound);
    } catch (error) {
      log.warn("Callback ack failed", error instanceof Error ? error.message : error);
    }
  }

  const externalUserId = inbound.externalUserId;
  const existing = await findContactByTelegram(botId, externalUserId);
  const session = existing ? await loadActiveSession(existing.id) : null;

  let text = inbound.text ?? null;
  // Meta channels have no /start. A first message that equals a growth-link slug (wa.me pre-filled text)
  // opens that link exactly like Telegram's /start <slug>.
  if (account.channel !== "telegram" && !existing && text && SLUG_PATTERN.test(text.trim())) {
    const link = await findGrowthLink(botId, text.trim());
    if (link) text = `/start ${text.trim()}`;
  }

  let profile = { username: inbound.username ?? null, firstName: inbound.firstName ?? null, lastName: inbound.lastName ?? null };
  if (!existing && !profile.firstName) {
    const looked = await lookupChannelProfile(account, externalUserId);
    if (looked) profile = { username: looked.username ?? profile.username, firstName: looked.firstName, lastName: looked.lastName };
  }

  const startParam = parseStartPayload(text);
  const growth = startParam ? await findGrowthLink(botId, startParam) : null;
  let flows = await loadActiveFlows(botId);
  const identity = { telegramUserId: externalUserId, ...profile };
  const prepared = growth ? attributedContact(existing, identity, growth) : existing;
  if (growth?.flowId && !session?.awaitingInput) {
    flows = preferLinkedFlow(flows, growth.flowId, growth.slug);
  }

  const baseEvent = {
    telegramUserId: externalUserId,
    username: profile.username,
    firstName: profile.firstName,
    lastName: profile.lastName,
    languageCode: inbound.languageCode ?? null,
    callbackData: inbound.callbackData ?? null,
    contactPhone: inbound.contactPhone ?? null,
    telegramMessageId: inbound.externalMessageId ?? null,
    kind: inbound.kind ?? "message",
    postId: inbound.comment?.postId ?? null,
    platformPostId: inbound.comment?.platformPostId ?? null,
    permalink: inbound.comment?.permalink ?? null,
    isReply: inbound.comment?.isReply ?? false,
  };
  const kind = inbound.kind ?? "message";

  let result: EngineResult = processInboundEvent({ contact: prepared, session, flows, event: { ...baseEvent, text } });

  // Meta channels: a brand-new contact whose first message matched nothing still gets the welcome flow,
  // the way ManyChat's Welcome Message fires on the first interaction.
  const untouched = result.replies.length === 0 && !result.session && !inbound.callbackData;
  if (account.channel !== "telegram" && kind === "message" && !existing && untouched && text !== "/start") {
    const welcome = processInboundEvent({
      contact: result.contact,
      session: null,
      flows,
      event: { ...baseEvent, text: "/start", telegramMessageId: null },
    });
    result = { ...welcome, inboundSaved: result.inboundSaved };
  }

  let contact = result.contact;
  if (growth) contact = applyGrowthAttribution(contact, growth);
  // Hub channels: remember where this person lives so later sends (flows, broadcasts, live chat) can reach them.
  contact = {
    ...contact,
    platform: inbound.platform ?? contact.platform ?? null,
    channelAccountId: inbound.channelAccountId ?? contact.channelAccountId ?? null,
    threadId: inbound.threadId ?? contact.threadId ?? null,
    avatarUrl: inbound.avatarUrl ?? contact.avatarUrl ?? null,
  };
  // WhatsApp identifies people by phone number, so the CRM phone is known from the first message.
  if (account.channel === "whatsapp" && inbound.contactPhone && !contact.phone) {
    contact = { ...contact, phone: inbound.contactPhone };
  }

  await persistContact(botId, contact);
  await persistSession(contact.id, result.session);

  if (growth) {
    try {
      await recordGrowthStart(growth.id, contact.id);
    } catch (error) {
      log.warn("recordGrowthStart failed", error instanceof Error ? error.message : error);
    }
  }

  if (result.inboundSaved && (text || inbound.callbackData || inbound.contactPhone || kind !== "message")) {
    await saveMessage({
      botId,
      contactId: contact.id,
      direction: "inbound",
      source: "user",
      body:
        inboundLabel(kind, text) ??
        text ??
        (inbound.contactPhone && account.channel === "telegram"
          ? `[shared phone] ${inbound.contactPhone}`
          : `[button] ${inbound.callbackData}`),
      telegramMessageId: inbound.externalMessageId ?? null,
    });
  }

  let replies = result.replies;
  if (kind === "comment" && inbound.comment && account.channel === "zernio" && inbound.channelAccountId) {
    replies = await answerComment(botId, account, contact, inbound, result.publicReply ?? null, replies);
  }
  await deliverReplies({ botId, account, contact, replies });

  // Effects run after the replies: a typing indicator belongs after the text it follows,
  // and webhooks/notifications should describe a message that has already gone out.
  await applyFlowEffects({ botId, account, contact, effects: result.effects });
}

function inboundLabel(kind: string, text: string | null) {
  if (kind === "comment") return `[comment] ${text ?? ""}`.trim();
  if (kind === "story_reply") return `[story reply] ${text ?? ""}`.trim();
  if (kind === "story_mention") return "[mentioned you in their story]";
  return null;
}

/**
 * Comment → DM. The public reply goes under the comment; the first flow message goes out as a
 * private reply (the only DM Instagram/Facebook allow before the person writes back). Anything after
 * it waits: ManyChat-style flows put a button on the opening message and continue from the tap.
 * Platforms without private replies (TikTok, YouTube, LinkedIn…) only get the public reply.
 */
async function answerComment(
  botId: string,
  account: ChannelAccount,
  contact: ContactRecord,
  inbound: NormalizedInbound,
  publicReply: string | null,
  replies: OutboundReply[],
) {
  const ref = {
    accountId: inbound.channelAccountId!,
    postId: inbound.comment!.postId,
    commentId: inbound.comment!.id,
    platform: inbound.platform ?? null,
  };
  if (publicReply) {
    try {
      const textReply = interpolateTemplate(publicReply, contact);
      await replyToZernioComment(account.token, ref, textReply);
      await saveMessage({ botId, contactId: contact.id, direction: "outbound", source: "flow", body: `[public reply] ${textReply}` });
    } catch (error) {
      log.warn("Public comment reply failed", error instanceof Error ? error.message : error);
    }
  }
  const [opening, ...rest] = replies;
  if (!opening) return [];
  const supportsPrivate = ref.platform === "instagram" || ref.platform === "facebook";
  if (!supportsPrivate) return [];
  try {
    const personalized = { ...opening, text: interpolateTemplate(opening.text, contact) };
    const sent = await sendZernioPrivateReply(account.token, ref, personalized);
    await saveMessage({
      botId,
      contactId: contact.id,
      direction: "outbound",
      source: "flow",
      body: outboundPreview(personalized.text, opening.media),
      telegramMessageId: sent.message_id || null,
    });
  } catch (error) {
    log.warn("Private reply failed", error instanceof Error ? error.message : error);
  }
  if (rest.length > 0) {
    log.info(`Comment flow held ${rest.length} message(s) until the contact replies (one private reply allowed)`);
  }
  return [];
}
