import { createHmac, timingSafeEqual } from "node:crypto";
import { renderForChannel } from "@/lib/channels/format";
import { CHANNELS, type ChannelAccount, type NormalizedInbound, type SentMessage } from "@/lib/channels/types";
import { publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";
import type { FlowMedia, OutboundReply } from "@/lib/types";

export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Messenger "Get Started" and ManyChat-style ref payloads open a conversation like Telegram's /start. */
export const GET_STARTED_PAYLOAD = "GET_STARTED";

export class ChannelApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelApiError";
  }
}

type GraphError = { error?: { message?: string; code?: number } };

export async function graphPost<T>(path: string, token: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok || json.error) {
    const message = json.error?.message ?? `Graph API ${response.status}`;
    log.warn(`Meta ${path} failed`, message);
    throw new ChannelApiError(message);
  }
  return json;
}

export async function graphGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}/${path}`, { headers: { authorization: `Bearer ${token}` } });
  const json = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok || json.error) {
    throw new ChannelApiError(json.error?.message ?? `Graph API ${response.status}`);
  }
  return json;
}

/** Local uploads live at /api/media/<id>; Meta fetches them, so they need the public origin. */
export function absoluteMediaUrl(media: FlowMedia): string | null {
  if (/^https?:\/\//i.test(media.url)) return media.url;
  const origin = publicUrl();
  if (!origin) return null;
  return `${origin}${media.url.startsWith("/") ? "" : "/"}${media.url}`;
}

function metaAttachmentType(media: FlowMedia): "image" | "video" | "audio" | "file" {
  if (media.kind === "video") return "video";
  if (media.kind === "audio") return "audio";
  if (media.kind === "document") return "file";
  return "image";
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export type MetaMessage = Record<string, unknown>;

/**
 * Turn one engine reply into Send API message bodies. Media goes first, then the text with buttons
 * or quick replies (Meta allows one of those per message). Instagram has no button template, so it
 * uses a generic template; Messenger uses the button template.
 */
export function buildMetaMessages(reply: OutboundReply, channel: "instagram" | "messenger"): MetaMessage[] {
  const meta = CHANNELS[channel];
  const messages: MetaMessage[] = [];
  const text = renderForChannel(reply.text ?? "", meta).trim();

  if (reply.media) {
    const url = absoluteMediaUrl(reply.media);
    if (url) {
      messages.push({ attachment: { type: metaAttachmentType(reply.media), payload: { url, is_reusable: true } } });
    } else {
      log.warn("Meta media skipped: set PUBLIC_URL so uploads have a public address");
    }
  }

  const buttons = (reply.buttons ?? []).slice(0, meta.maxButtons).map((button) =>
    button.url
      ? { type: "web_url", title: clip(button.text, 20), url: button.url }
      : { type: "postback", title: clip(button.text, 20), payload: button.data ?? "n:" },
  );
  const overflow = (reply.buttons ?? []).slice(meta.maxButtons);
  const quickReplies = (reply.keyboard ?? []).slice(0, meta.maxQuickReplies).map((title) => ({
    content_type: "text",
    title: clip(title, 20),
    payload: `qr:${title}`,
  }));

  let body = text;
  if (overflow.length > 0) {
    body = [body, ...overflow.map((button) => (button.url ? `${button.text}: ${button.url}` : `• ${button.text}`))]
      .filter(Boolean)
      .join("\n");
  }

  if (buttons.length > 0) {
    const attachment =
      channel === "messenger"
        ? { type: "template", payload: { template_type: "button", text: clip(body || "…", 640), buttons } }
        : {
            type: "template",
            payload: { template_type: "generic", elements: [{ title: clip(body || "…", 80), buttons }] },
          };
    const message: MetaMessage = { attachment };
    if (quickReplies.length > 0) message.quick_replies = quickReplies;
    if (channel === "instagram" && body.length > 80) messages.push({ text: body });
    messages.push(message);
    return messages;
  }

  if (body || quickReplies.length > 0) {
    const message: MetaMessage = { text: clip(body || "…", 2000) };
    if (quickReplies.length > 0) message.quick_replies = quickReplies;
    messages.push(message);
  }
  return messages;
}

export async function sendMetaReply(
  account: ChannelAccount,
  recipientId: string,
  reply: OutboundReply,
): Promise<SentMessage> {
  const channel = account.channel === "instagram" ? "instagram" : "messenger";
  const path = `${account.externalAccountId || "me"}/messages`;
  let last: SentMessage = { message_id: "" };
  for (const message of buildMetaMessages(reply, channel)) {
    const sent = await graphPost<{ message_id?: string }>(path, account.token, {
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message,
    });
    last = { message_id: sent.message_id ?? "" };
  }
  return last;
}

export async function sendMetaTyping(account: ChannelAccount, recipientId: string) {
  await graphPost(`${account.externalAccountId || "me"}/messages`, account.token, {
    recipient: { id: recipientId },
    sender_action: "typing_on",
  });
}

/** Best-effort profile lookup for a new contact. */
export async function fetchMetaProfile(account: ChannelAccount, userId: string) {
  try {
    const fields = account.channel === "instagram" ? "name,username" : "first_name,last_name";
    const profile = await graphGet<{ first_name?: string; last_name?: string; name?: string; username?: string }>(
      `${userId}?fields=${fields}`,
      account.token,
    );
    if (account.channel === "instagram") {
      const [first, ...rest] = (profile.name ?? "").split(" ");
      return { firstName: first || null, lastName: rest.join(" ") || null, username: profile.username ?? null };
    }
    return { firstName: profile.first_name ?? null, lastName: profile.last_name ?? null, username: null };
  } catch {
    return null;
  }
}

export function verifyMetaSignature(appSecret: string | null, rawBody: string, header: string | null): boolean {
  if (!appSecret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
}

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload?: string };
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
  postback?: { title?: string; payload?: string; referral?: { ref?: string } };
  referral?: { ref?: string };
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: { id?: string; messaging?: MessagingEvent[] }[];
};

/** Normalize Messenger / Instagram webhook events. Echoes and deliveries are dropped. */
export function parseMetaWebhook(payload: MetaWebhookPayload): NormalizedInbound[] {
  const events: NormalizedInbound[] = [];
  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const sender = event.sender?.id;
      if (!sender) continue;
      if (event.message?.is_echo) continue;

      const ref = event.referral?.ref ?? event.postback?.referral?.ref ?? null;
      const quick = event.message?.quick_reply?.payload;
      const postback = event.postback?.payload;

      if (event.message) {
        let text = event.message.text ?? null;
        if (quick?.startsWith("qr:")) text = quick.slice(3);
        if (!text && event.message.attachments?.length) {
          text = `[${event.message.attachments[0]?.type ?? "attachment"}]`;
        }
        events.push({
          externalUserId: sender,
          text: ref ? `/start ${ref}` : text,
          callbackData: quick && quick.startsWith("n:") ? quick : null,
          externalMessageId: event.message.mid ?? null,
          referral: ref,
        });
        continue;
      }

      if (postback !== undefined) {
        const isStart = postback === GET_STARTED_PAYLOAD || Boolean(ref);
        events.push({
          externalUserId: sender,
          text: isStart ? (ref ? `/start ${ref}` : "/start") : postback.startsWith("n:") ? null : event.postback?.title ?? null,
          callbackData: postback.startsWith("n:") ? postback : null,
          ...(postback.startsWith("n:") && event.postback?.title ? { callbackTitle: event.postback.title } : {}),
          referral: ref,
        });
        continue;
      }

      if (ref) {
        events.push({ externalUserId: sender, text: `/start ${ref}`, referral: ref });
      }
    }
  }
  return events;
}
