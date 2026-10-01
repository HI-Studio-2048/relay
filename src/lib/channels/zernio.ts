import { createHmac, timingSafeEqual } from "node:crypto";
import { renderForChannel } from "@/lib/channels/format";
import { ChannelApiError, absoluteMediaUrl } from "@/lib/channels/meta";
import { CHANNELS, type ChannelAccount, type ChannelTarget, type NormalizedInbound, type SentMessage } from "@/lib/channels/types";
import { log } from "@/lib/logger";
import type { FlowMedia, OutboundReply } from "@/lib/types";

/**
 * Zernio: one REST API (https://zernio.com/api) for DMs and comments across Instagram, Facebook,
 * WhatsApp, Telegram, X, TikTok, Bluesky, Reddit, LinkedIn, Threads, YouTube and SMS.
 * One Relay account holds one Zernio API key; every social account in that workspace (or the ones
 * listed in externalAccountId) routes through it. Shapes follow the official @zernio/node SDK.
 */
export function zernioBase() {
  return (process.env.ZERNIO_API_BASE || "https://zernio.com/api").replace(/\/+$/, "");
}

export const ZERNIO_WEBHOOK_EVENTS = ["message.received", "comment.received", "referral.received"] as const;

/** Platforms a Zernio workspace can bring in, for badges and per-platform limits. */
export const ZERNIO_PLATFORMS: Record<string, { label: string; color: string; maxButtons: number; dm: boolean }> = {
  instagram: { label: "Instagram", color: "#E1306C", maxButtons: 3, dm: true },
  facebook: { label: "Messenger", color: "#0084FF", maxButtons: 3, dm: true },
  whatsapp: { label: "WhatsApp", color: "#25D366", maxButtons: 3, dm: true },
  telegram: { label: "Telegram", color: "#229ED9", maxButtons: 3, dm: true },
  twitter: { label: "X", color: "#111111", maxButtons: 0, dm: true },
  tiktok: { label: "TikTok", color: "#FE2C55", maxButtons: 0, dm: true },
  bluesky: { label: "Bluesky", color: "#1185FE", maxButtons: 0, dm: true },
  reddit: { label: "Reddit", color: "#FF4500", maxButtons: 0, dm: true },
  sms: { label: "SMS", color: "#6B7280", maxButtons: 0, dm: true },
  rcs: { label: "RCS", color: "#4285F4", maxButtons: 0, dm: true },
  imessage: { label: "iMessage", color: "#34C759", maxButtons: 0, dm: true },
  slack: { label: "Slack", color: "#4A154B", maxButtons: 0, dm: true },
  threads: { label: "Threads", color: "#000000", maxButtons: 0, dm: false },
  youtube: { label: "YouTube", color: "#FF0000", maxButtons: 0, dm: false },
  linkedin: { label: "LinkedIn", color: "#0A66C2", maxButtons: 0, dm: false },
};

export function zernioPlatformMeta(platform: string | null | undefined) {
  return (platform && ZERNIO_PLATFORMS[platform]) || { label: platform || "Social", color: "#6B7280", maxButtons: 0, dm: true };
}

type ZernioError = { error?: string | { message?: string }; message?: string };

export async function zernioRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  apiKey: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${zernioBase()}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as T & ZernioError;
  if (!response.ok) {
    const raw = json.error;
    const message = (typeof raw === "string" ? raw : raw?.message) ?? json.message ?? `Zernio ${response.status}`;
    log.warn(`Zernio ${method} ${path.split("?")[0]} failed`, message);
    throw new ChannelApiError(message);
  }
  return json;
}

export type ZernioAccount = {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string | null;
  isActive?: boolean;
  needsReconnection?: boolean;
};

export async function listZernioAccounts(apiKey: string): Promise<ZernioAccount[]> {
  const data = await zernioRequest<{ accounts?: ZernioAccount[] }>("GET", "/v1/accounts", apiKey);
  return data.accounts ?? [];
}

/** Register (or refresh) the webhook that feeds this Relay account. Returns the Zernio webhook id. */
export async function registerZernioWebhook(apiKey: string, input: { url: string; secret: string; existingId?: string | null; accountIds?: string[] }) {
  const body = {
    name: "Relay",
    url: input.url,
    secret: input.secret,
    events: [...ZERNIO_WEBHOOK_EVENTS],
    isActive: true,
    ...(input.accountIds?.length ? { accountIds: input.accountIds } : {}),
  };
  if (input.existingId) {
    try {
      await zernioRequest("PUT", "/v1/webhooks/settings", apiKey, { webhookId: input.existingId, ...body });
      return input.existingId;
    } catch (error) {
      log.warn("Zernio webhook update failed, creating a new one", error instanceof Error ? error.message : error);
    }
  }
  const created = await zernioRequest<{ webhook?: { _id?: string; id?: string } }>("POST", "/v1/webhooks/settings", apiKey, body);
  return created.webhook?._id ?? created.webhook?.id ?? null;
}

export function verifyZernioSignature(secret: string | null, rawBody: string, header: string | null): boolean {
  if (!secret) return true;
  if (!header) return false;
  const given = header.replace(/^sha256=/, "").trim().toLowerCase();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (given.length !== expected.length || !/^[0-9a-f]+$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
}

function attachmentType(media: FlowMedia): "image" | "video" | "audio" | "file" {
  if (media.kind === "video") return "video";
  if (media.kind === "audio") return "audio";
  if (media.kind === "document") return "file";
  return "image";
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export type ZernioMessageBody = Record<string, unknown>;

/**
 * Turn one engine reply into Zernio send bodies. Zernio takes text + one attachment + either
 * buttons (max 3) or quick replies (max 13). Platforms without buttons get them as numbered text,
 * and the engine (typedButton) maps a typed number or label back to the button.
 */
export function buildZernioMessages(reply: OutboundReply, platform: string | null | undefined): ZernioMessageBody[] {
  const meta = zernioPlatformMeta(platform);
  const text = renderForChannel(reply.text ?? "", CHANNELS.zernio).trim();
  const body: ZernioMessageBody = {};
  if (reply.media) {
    const url = absoluteMediaUrl(reply.media);
    if (url) {
      body.attachmentUrl = url;
      body.attachmentType = attachmentType(reply.media);
      if (reply.media.filename) body.attachmentName = reply.media.filename;
    } else {
      log.warn("Zernio media skipped: set PUBLIC_URL so uploads have a public address");
    }
  }

  const all = reply.buttons ?? [];
  const native = meta.maxButtons > 0 ? all.slice(0, meta.maxButtons) : [];
  const overflow = all.slice(native.length);
  let message = text;
  if (overflow.length > 0) {
    message = [
      message,
      // Numbered by position in the full list, so a typed number maps back to the same button.
      ...overflow.map((button, index) => (button.url ? `${button.text}: ${button.url}` : `${native.length + index + 1}. ${button.text}`)),
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (message) body.message = message;

  if (native.length > 0) {
    body.buttons = native.map((button) =>
      button.url
        ? { type: "url", title: clip(button.text, 20), url: button.url }
        : { type: "postback", title: clip(button.text, 20), payload: button.data ?? "n:" },
    );
  } else if ((reply.keyboard ?? []).length > 0) {
    if (meta.maxButtons > 0) {
      body.quickReplies = (reply.keyboard ?? []).slice(0, 13).map((title) => ({ title: clip(title, 20), payload: `qr:${title}` }));
    } else {
      body.message = [message, ...(reply.keyboard ?? []).map((title) => `• ${title}`)].filter(Boolean).join("\n");
    }
  }
  if (!body.message && !body.attachmentUrl) return [];
  return [body];
}

function requireRoute(account: ChannelAccount, target: ChannelTarget) {
  const accountId = target.channelAccountId || account.externalAccountId?.split(",")[0]?.trim();
  if (!accountId) throw new ChannelApiError("This contact has no Zernio account to reply from");
  if (!target.threadId) throw new ChannelApiError("This contact has no Zernio conversation yet");
  return { accountId, conversationId: target.threadId };
}

export async function sendZernioReply(account: ChannelAccount, target: ChannelTarget, reply: OutboundReply): Promise<SentMessage> {
  const { accountId, conversationId } = requireRoute(account, target);
  let last: SentMessage = { message_id: "" };
  for (const body of buildZernioMessages(reply, target.platform)) {
    const sent = await zernioRequest<{ data?: { messageId?: string } }>(
      "POST",
      `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
      account.token,
      { accountId, ...body },
    );
    last = { message_id: sent.data?.messageId ?? "" };
  }
  return last;
}

export async function sendZernioTyping(account: ChannelAccount, target: ChannelTarget) {
  const { accountId, conversationId } = requireRoute(account, target);
  await zernioRequest("POST", `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/typing`, account.token, { accountId });
}

export type ZernioCommentRef = { accountId: string; postId: string; commentId: string; platform?: string | null };

/** Public reply under a comment. */
export async function replyToZernioComment(apiKey: string, ref: ZernioCommentRef, message: string) {
  await zernioRequest("POST", `/v1/inbox/comments/${encodeURIComponent(ref.postId)}`, apiKey, {
    accountId: ref.accountId,
    message,
    commentId: ref.commentId,
  });
}

/** Instagram / Facebook "private reply": the DM that opens a conversation from a comment. */
export async function sendZernioPrivateReply(apiKey: string, ref: ZernioCommentRef, reply: OutboundReply): Promise<SentMessage> {
  const [body] = buildZernioMessages({ ...reply, media: undefined }, ref.platform ?? "instagram");
  const sent = await zernioRequest<{ data?: { messageId?: string } }>(
    "POST",
    `/v1/inbox/comments/${encodeURIComponent(ref.postId)}/${encodeURIComponent(ref.commentId)}/private-reply`,
    apiKey,
    { accountId: ref.accountId, message: (body?.message as string) || reply.text || "…", ...(body?.buttons ? { buttons: body.buttons } : {}), ...(body?.quickReplies ? { quickReplies: body.quickReplies } : {}) },
  );
  return { message_id: sent.data?.messageId ?? "" };
}

type ZernioAttachment = { type?: string; originalType?: string; url?: string };

export type ZernioWebhookPayload = {
  id?: string;
  event?: string;
  message?: {
    id?: string;
    conversationId?: string;
    platform?: string;
    platformMessageId?: string;
    direction?: "incoming" | "outgoing";
    text?: string | null;
    attachments?: ZernioAttachment[];
    sender?: { id?: string; name?: string; username?: string; picture?: string; phoneNumber?: string | null };
  };
  conversation?: { id?: string; participantId?: string; participantName?: string; participantUsername?: string; participantPicture?: string };
  account?: { id?: string; accountId?: string; platform?: string; username?: string };
  metadata?: {
    quickReplyPayload?: string;
    postbackPayload?: string;
    postbackTitle?: string;
    callbackData?: string;
    buttonPayload?: string;
    interactiveId?: string;
    storyReply?: { storyId?: string; storyUrl?: string };
    isStoryMention?: boolean;
    referral?: { ref?: string; ad_id?: string; source?: string } | null;
  } | null;
  comment?: {
    id?: string;
    postId?: string | null;
    platformPostId?: string;
    platform?: string;
    text?: string;
    author?: { id?: string; username?: string; name?: string; picture?: string | null; isOwnAccount?: boolean };
    isReply?: boolean;
    parentCommentId?: string | null;
  };
  post?: { id?: string | null; platformPostId?: string; content?: string | null; permalink?: string | null };
  referral?: { ref?: string };
  sender?: { id?: string; name?: string; username?: string };
};

function splitName(name: string | undefined | null) {
  const [first, ...rest] = (name ?? "").trim().split(/\s+/);
  return { firstName: first || null, lastName: rest.join(" ") || null };
}

/** Contacts are unique per bot; the same person on two Zernio accounts is two threads, so key on both. */
export function zernioContactKey(accountId: string, senderId: string) {
  return `${accountId}:${senderId}`;
}

function accountAllowed(filter: string | null, accountId: string) {
  const allowed = (filter ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(accountId);
}

/** Normalize Zernio webhooks (message.received, comment.received, referral.received) into engine events. */
export function parseZernioWebhook(payload: ZernioWebhookPayload, accountFilter: string | null = null): NormalizedInbound[] {
  const accountId = payload.account?.accountId ?? payload.account?.id ?? "";
  if (!accountId || !accountAllowed(accountFilter, accountId)) return [];

  if (payload.event === "message.received" && payload.message) {
    const message = payload.message;
    if (message.direction === "outgoing") return [];
    const senderId = message.sender?.id ?? payload.conversation?.participantId;
    if (!senderId) return [];
    const meta = payload.metadata ?? {};
    const payloadValue =
      meta.postbackPayload ?? meta.quickReplyPayload ?? meta.callbackData ?? meta.buttonPayload ?? meta.interactiveId ?? null;
    const ref = meta.referral?.ref ?? null;
    let text = message.text ?? null;
    let callbackData: string | null = null;
    if (payloadValue?.startsWith("n:") || payloadValue?.startsWith("flow:")) {
      callbackData = payloadValue;
      text = null;
    } else if (payloadValue?.startsWith("qr:")) {
      text = payloadValue.slice(3);
    }
    const first = message.attachments?.[0];
    let kind: NormalizedInbound["kind"] = "message";
    if (meta.isStoryMention || first?.originalType === "story_mention") kind = "story_mention";
    else if (meta.storyReply?.storyId) kind = "story_reply";
    if (!text && !callbackData && first) text = `[${first.originalType ?? first.type ?? "attachment"}]`;
    const name = message.sender?.name ?? payload.conversation?.participantName;
    return [
      {
        externalUserId: zernioContactKey(accountId, senderId),
        username: message.sender?.username ?? payload.conversation?.participantUsername ?? null,
        ...splitName(name),
        text: ref && !callbackData ? `/start ${ref}` : text,
        callbackData,
        callbackTitle: callbackData ? meta.postbackTitle ?? message.text ?? null : null,
        contactPhone: message.sender?.phoneNumber ?? null,
        externalMessageId: message.platformMessageId ?? message.id ?? null,
        referral: ref,
        kind,
        platform: message.platform ?? payload.account?.platform ?? null,
        channelAccountId: accountId,
        threadId: message.conversationId ?? payload.conversation?.id ?? null,
        avatarUrl: message.sender?.picture ?? payload.conversation?.participantPicture ?? null,
        storyUrl: meta.storyReply?.storyUrl ?? null,
      },
    ];
  }

  if (payload.event === "comment.received" && payload.comment) {
    const comment = payload.comment;
    const authorId = comment.author?.id;
    if (!authorId || comment.author?.isOwnAccount) return [];
    return [
      {
        externalUserId: zernioContactKey(accountId, authorId),
        username: comment.author?.username ?? null,
        ...splitName(comment.author?.name),
        text: comment.text ?? "",
        externalMessageId: comment.id ?? null,
        kind: "comment",
        platform: comment.platform ?? payload.account?.platform ?? null,
        channelAccountId: accountId,
        threadId: null,
        avatarUrl: comment.author?.picture ?? null,
        comment: {
          id: comment.id ?? "",
          postId: comment.postId ?? payload.post?.id ?? comment.platformPostId ?? payload.post?.platformPostId ?? "",
          platformPostId: comment.platformPostId ?? payload.post?.platformPostId ?? "",
          isReply: Boolean(comment.isReply),
          postCaption: payload.post?.content ?? null,
          permalink: payload.post?.permalink ?? null,
        },
      },
    ];
  }

  if (payload.event === "referral.received") {
    const ref = payload.referral?.ref ?? payload.metadata?.referral?.ref;
    const senderId = payload.sender?.id ?? payload.conversation?.participantId;
    if (!ref || !senderId) return [];
    return [
      {
        externalUserId: zernioContactKey(accountId, senderId),
        username: payload.sender?.username ?? null,
        ...splitName(payload.sender?.name ?? payload.conversation?.participantName),
        text: `/start ${ref}`,
        referral: ref,
        kind: "message",
        platform: payload.account?.platform ?? null,
        channelAccountId: accountId,
        threadId: payload.conversation?.id ?? null,
      },
    ];
  }
  return [];
}
