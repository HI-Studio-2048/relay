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
import { readAiSettings } from "@/lib/ai";
import { isWithinHours, readHours } from "@/lib/starters";
import { emitWebhookSoon, publicContact } from "@/lib/developer";
import { buttonSourceStep, recordFlowEvents } from "@/lib/analytics";
import { runAiAutoReply } from "@/lib/ai-runtime";
import { hideZernioComment, replyToZernioComment, sendZernioPrivateReply } from "@/lib/channels/zernio";
import { moderationReason, readModeration } from "@/lib/social-triggers";
import { deliverReplies, loadBotFieldValues } from "@/lib/flow-dispatch";
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
  isBotPaused,
  resumeContactAutomation,
  loadActiveFlows,
  loadActiveSession,
  persistContact,
  persistSession,
  saveMessage,
} from "@/lib/store";
import type { TelegramUpdate } from "@/lib/telegram";
import type { ContactRecord, FlowSessionState, OutboundReply } from "@/lib/types";

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

const AWAY_FIELD = "_away_at";

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
  let session = existing ? await loadActiveSession(existing.id) : null;
  // A takeover pause that has run out resumes the flow it paused (Live Chat "Resume" does the same by hand).
  if (existing && session?.status === "paused" && existing.botPausedUntil && !isBotPaused({ botPausedUntil: existing.botPausedUntil })) {
    session = await resumeContactAutomation(existing.id);
  }

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
  let prepared = growth ? attributedContact(existing, identity, growth) : existing;
  // Follower status and similar profile facts land before the engine runs, so a Condition in this
  // very event (a "follow to unlock" gate) sees the current value.
  if (inbound.profileFields) {
    prepared = prepared
      ? { ...prepared, customFields: { ...prepared.customFields, ...inbound.profileFields } }
      : {
          id: crypto.randomUUID(),
          telegramUserId: externalUserId,
          username: profile.username,
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: null,
          phone: null,
          customFields: { ...inbound.profileFields },
          tags: [],
          subscriptions: [],
          unsubscribed: false,
          welcomed: false,
          notes: "",
          inboxStatus: "open",
        };
  }
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

  // Comment moderation runs before any automation: a hidden comment gets no reply at all.
  const commentRef =
    kind === "comment" && inbound.comment && account.channel === "zernio" && inbound.channelAccountId
      ? { accountId: inbound.channelAccountId, postId: inbound.comment.postId, commentId: inbound.comment.id, platform: inbound.platform ?? null }
      : null;
  const hideReason = commentRef ? moderationReason(readModeration(bot.settings), text ?? "") : null;
  if (commentRef && hideReason) {
    try {
      await hideZernioComment(account.token, commentRef);
    } catch (error) {
      log.warn("Hiding a comment failed", error instanceof Error ? error.message : error);
    }
    const base = existing ?? prepared;
    const record = base ?? {
      id: crypto.randomUUID(),
      telegramUserId: externalUserId,
      username: profile.username,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: null,
      phone: null,
      customFields: {},
      tags: [],
      platform: inbound.platform ?? null,
      channelAccountId: inbound.channelAccountId ?? null,
      avatarUrl: inbound.avatarUrl ?? null,
    };
    await persistContact(botId, record);
    await saveMessage({ botId, contactId: record.id, direction: "inbound", source: "user", body: `[comment] ${text ?? ""}`.trim() });
    await saveMessage({ botId, contactId: record.id, direction: "outbound", source: "flow", body: `[public reply] Hidden automatically (${hideReason})` });
    return;
  }

  // Live Chat takeover: a teammate (or an AI hand-off) is handling this person. Log the message or
  // comment and leave it for them — no flow, keyword, comment automation or AI reply.
  const paused = Boolean(existing?.botPausedUntil && isBotPaused({ botPausedUntil: existing.botPausedUntil }));
  let result: EngineResult =
    paused && !startParam
      ? { contact: { ...existing!, inboxStatus: "open" }, session, replies: [], inboundSaved: true, effects: [] }
      : processInboundEvent({ contact: prepared, session, flows, event: { ...baseEvent, text } });

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
  if (inbound.profileFields) contact = { ...contact, customFields: { ...contact.customFields, ...inbound.profileFields } };
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
          : `[button] ${inbound.callbackTitle ?? buttonLabel(flows, session, inbound.callbackData)}`),
      telegramMessageId: inbound.externalMessageId ?? null,
    });
  }

  if (result.inboundSaved) {
    emitWebhookSoon(botId, "message.received", {
      contact: publicContact(contact),
      kind,
      text: text ?? null,
      button: inbound.callbackData ? inbound.callbackTitle ?? inbound.callbackData : null,
      ...(inbound.comment ? { comment: { id: inbound.comment.id, post_id: inbound.comment.postId, permalink: inbound.comment.permalink ?? null } } : {}),
    });
  }
  for (const flowId of result.completedFlowIds ?? []) {
    emitWebhookSoon(botId, "flow.completed", { contact: publicContact(contact), flow: { id: flowId } });
  }

  const clickedNext = inbound.callbackData?.startsWith("n:") ? inbound.callbackData.slice(2) : null;
  const clickedFlow = clickedNext && session ? flows.find((flow) => flow.id === session.flowId) : null;
  await recordFlowEvents([
    ...(result.startedFlowId ? [{ botId, flowId: result.startedFlowId, contactId: contact.id, kind: "start" as const }] : []),
    ...(clickedFlow
      ? [{ botId, flowId: clickedFlow.id, stepId: buttonSourceStep(clickedFlow.definition, clickedNext!), contactId: contact.id, kind: "click" as const }]
      : result.clicked
        ? [{ botId, flowId: result.clicked.flowId, stepId: result.clicked.stepId, contactId: contact.id, kind: "click" as const }]
        : []),
    ...(result.completedFlowIds ?? []).map((flowId) => ({ botId, flowId, contactId: contact.id, kind: "complete" as const })),
  ]);

  let replies = result.replies;
  if (kind === "comment" && inbound.comment && account.channel === "zernio" && inbound.channelAccountId) {
    const answered = await answerComment(botId, account, contact, inbound, result.publicReply ?? null, replies);
    replies = [];
    if (answered.session !== undefined) await persistSession(contact.id, answered.session);
    const matched = result.matchedFlowId ? flows.find((flow) => flow.id === result.matchedFlowId) : null;
    if (matched?.definition.trigger?.hideAfterReply && commentRef) {
      try {
        await hideZernioComment(account.token, commentRef);
      } catch (error) {
        log.warn("Hiding a comment failed", error instanceof Error ? error.message : error);
      }
    }
  }
  await deliverReplies({ botId, account, contact, replies });

  // Effects run after the replies: a typing indicator belongs after the text it follows,
  // and webhooks/notifications should describe a message that has already gone out.
  await applyFlowEffects({ botId, account, contact, effects: result.effects });

  // AI auto-reply: nothing matched, nobody is mid-flow, and the account turned AI answers on.
  const unanswered =
    replies.length === 0 &&
    result.effects.length === 0 &&
    !inbound.callbackData &&
    (kind === "message" || kind === "story_reply") &&
    Boolean(text?.trim()) &&
    !text!.trim().startsWith("/") &&
    // Not while a flow waits on them or a delayed follow-up is pending.
    (!result.session || (result.session.status === "active" && !result.session.awaitingInput && !result.session.resumeAt));
  let aiAnswered = false;
  if (unanswered && !paused && readAiSettings(bot.settings).autoReply) {
    try {
      aiAnswered = await runAiAutoReply({ botId, account, contactId: contact.id });
    } catch (error) {
      log.warn("AI auto-reply failed", error instanceof Error ? error.message : error);
    }
  }

  // Business hours: a message nobody answered automatically, outside hours, gets the away message
  // (at most once every 12 hours per person).
  const hours = readHours(bot.settings);
  if ((unanswered || paused) && !aiAnswered && kind === "message" && hours.enabled && !isWithinHours(hours)) {
    const last = Date.parse(contact.customFields[AWAY_FIELD] ?? "");
    if (!Number.isFinite(last) || Date.now() - last > 12 * 3_600_000) {
      try {
        await deliverReplies({ botId, account, contact, replies: [{ text: hours.awayMessage, source: "flow" }] });
        await persistContact(botId, { ...contact, customFields: { ...contact.customFields, [AWAY_FIELD]: new Date().toISOString() } }, { skipRules: true });
      } catch (error) {
        log.warn("Away message failed", error instanceof Error ? error.message : error);
      }
    }
  }
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
 * it waits for a tap: the flow's own button, or a Continue button Relay adds when there is none.
 * Platforms without private replies (TikTok, YouTube, LinkedIn…) only get the public reply.
 * Returns the session to store (undefined keeps the engine's).
 */
async function answerComment(
  botId: string,
  account: ChannelAccount,
  contact: ContactRecord,
  inbound: NormalizedInbound,
  publicReply: string | null,
  replies: OutboundReply[],
): Promise<{ session: FlowSessionState | null | undefined }> {
  const ref = {
    accountId: inbound.channelAccountId!,
    postId: inbound.comment!.postId,
    commentId: inbound.comment!.id,
    platform: inbound.platform ?? null,
  };
  if (publicReply) {
    try {
      const textReply = interpolateTemplate(publicReply, contact, await loadBotFieldValues(botId));
      await replyToZernioComment(account.token, ref, textReply);
      await saveMessage({ botId, contactId: contact.id, direction: "outbound", source: "flow", body: `[public reply] ${textReply}` });
    } catch (error) {
      log.warn("Public comment reply failed", error instanceof Error ? error.message : error);
    }
  }
  const [opening, ...rest] = replies;
  if (!opening) return { session: undefined };
  const supportsPrivate = ref.platform === "instagram" || ref.platform === "facebook";
  // TikTok, YouTube, LinkedIn…: only the public reply is possible, so do not leave a flow running.
  if (!supportsPrivate) return { session: null };
  // One private reply is allowed until the person answers. If the opening message has no button,
  // add a Continue button that resumes the flow at the next message instead of dropping it.
  const hasCallback = (opening.buttons ?? []).some((button) => button.data?.startsWith("n:"));
  const held = rest.find((reply) => reply.stepId);
  const withContinue =
    !hasCallback && held?.stepId
      ? { ...opening, buttons: [...(opening.buttons ?? []), { text: "Continue", data: `n:${held.stepId}` }] }
      : opening;
  let session: FlowSessionState | null | undefined;
  if (!hasCallback && held?.stepId && opening.flowId) {
    session = { id: crypto.randomUUID(), contactId: contact.id, flowId: opening.flowId, stepId: held.stepId, awaitingInput: false, status: "active" };
  }
  try {
    const personalized = { ...withContinue, text: interpolateTemplate(withContinue.text, contact, await loadBotFieldValues(botId)) };
    const sent = await sendZernioPrivateReply(account.token, ref, personalized);
    await saveMessage({
      botId,
      contactId: contact.id,
      direction: "outbound",
      source: "flow",
      body: outboundPreview(personalized.text, opening.media),
      telegramMessageId: sent.message_id || null,
    });
    if (opening.flowId) {
      await recordFlowEvents([{ botId, flowId: opening.flowId, stepId: opening.stepId, contactId: contact.id, kind: "sent" }]);
    }
  } catch (error) {
    log.warn("Private reply failed", error instanceof Error ? error.message : error);
    return { session: null };
  }
  return { session };
}

/** Telegram does not echo the button text, so read it back from the flow that drew the button. */
function buttonLabel(flows: { id: string; definition: { steps: { type: string; buttons?: { text: string; next?: string }[] }[] } }[], session: { flowId: string } | null, data: string | null | undefined) {
  const next = data?.startsWith("n:") ? data.slice(2) : null;
  if (!next) return data ?? "";
  const ordered = session ? [...flows].sort((a) => (a.id === session.flowId ? -1 : 1)) : flows;
  for (const flow of ordered) {
    for (const step of flow.definition.steps) {
      const hit = step.buttons?.find((button) => button.next === next);
      if (hit) return hit.text;
    }
  }
  return data ?? "";
}
