import { createHmac, timingSafeEqual } from "node:crypto";
import { renderForChannel } from "@/lib/channels/format";
import { absoluteMediaUrl, ChannelApiError } from "@/lib/channels/meta";
import { CHANNELS, isRelayPayload, type ChannelAccount, type NormalizedInbound, type SentMessage } from "@/lib/channels/types";
import { log } from "@/lib/logger";
import type { OutboundReply } from "@/lib/types";

const API = "https://slack.com/api";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

type SlackResponse = { ok: boolean; error?: string };

/**
 * One Slack Web API call as a bot. Slack answers 200 with `ok: false` for most failures, and 429 with a
 * Retry-After header for rate limits, which is waited out once.
 */
export async function slackRequest<T extends SlackResponse>(token: string, method: string, body: Record<string, unknown> = {}, attempt = 0): Promise<T> {
  // Slack only accepts a JSON body on write methods like chat.postMessage. Read methods such as
  // users.info want form-encoded parameters and answer a JSON body with an error.
  const asJson = method.startsWith("chat.");
  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": asJson ? "application/json; charset=utf-8" : "application/x-www-form-urlencoded" },
    body: asJson ? JSON.stringify(body) : new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])).toString(),
  });
  if (response.status === 429 && attempt < 2) {
    const wait = Number(response.headers.get("retry-after") ?? "1");
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(wait, 1) * 1000, 10_000)));
    return slackRequest<T>(token, method, body, attempt + 1);
  }
  const data = (await response.json().catch(() => ({ ok: false, error: `http_${response.status}` }))) as T;
  if (!data.ok) throw new ChannelApiError(`Slack: ${data.error ?? `request failed (${response.status})`}`);
  return data;
}

export type SlackIdentity = { team: string; team_id: string; user: string; user_id: string; bot_id?: string };

/** Who this token belongs to. Doubles as the "is the token valid" check when connecting. */
export function fetchSlackIdentity(token: string) {
  return slackRequest<SlackResponse & SlackIdentity>(token, "auth.test");
}

/** Slack verifies that a request is from Slack with v0=HMAC-SHA256(signing secret, "v0:timestamp:body"). */
export function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  now = Date.now(),
): boolean {
  if (!timestamp || !signature?.startsWith("v0=")) return false;
  const age = Math.abs(now / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`, "utf8").digest("hex");
  const given = signature.slice(3);
  if (expected.length !== given.length || !/^[0-9a-f]+$/i.test(given)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
}

type SlackBlock = Record<string, unknown>;
export type SlackMessageBody = { text: string; mrkdwn: false; blocks?: SlackBlock[] };

/**
 * Slack message body for one engine reply. Plain text goes out as is. With buttons or quick replies it
 * becomes a text section plus action rows (5 buttons to a row, 25 at most), and an image gets its own block.
 */
export function buildSlackMessage(reply: OutboundReply): SlackMessageBody {
  const meta = CHANNELS.slack;
  let text = renderForChannel(reply.text ?? "", meta).trim();

  const buttons: SlackBlock[] = [];
  for (const button of reply.buttons ?? []) {
    const id = `b${buttons.length}`;
    if (button.url) buttons.push({ type: "button", action_id: id, text: { type: "plain_text", text: clip(button.text, 75) }, url: button.url });
    else buttons.push({ type: "button", action_id: id, text: { type: "plain_text", text: clip(button.text, 75) }, value: clip(button.data ?? "n:", 2000) });
  }
  for (const title of reply.keyboard ?? []) {
    buttons.push({ type: "button", action_id: `b${buttons.length}`, text: { type: "plain_text", text: clip(title, 75) }, value: clip(`qr:${title}`, 2000) });
  }

  const blocks: SlackBlock[] = [];
  if (reply.media) {
    const link = absoluteMediaUrl(reply.media);
    if (!link) log.warn("Slack media skipped: set PUBLIC_URL so uploads have a public address");
    else if (reply.media.kind === "photo" || reply.media.kind === "animation") blocks.push({ type: "image", image_url: link, alt_text: clip(text || "image", 2000) });
    else text = [text, link].filter(Boolean).join("\n");
  }
  if (!text) text = buttons.length ? "Choose an option" : blocks.length ? "Image" : "​";
  text = clip(text, 3000);

  if (!blocks.length && !buttons.length) return { text, mrkdwn: false };
  blocks.unshift({ type: "section", text: { type: "plain_text", text, emoji: true } });
  const usable = buttons.slice(0, 25);
  for (let i = 0; i < usable.length; i += 5) blocks.push({ type: "actions", elements: usable.slice(i, i + 5) });
  return { text, mrkdwn: false, blocks };
}

export async function sendSlackReply(account: ChannelAccount, to: string, reply: OutboundReply): Promise<SentMessage> {
  const sent = await slackRequest<SlackResponse & { ts: string }>(account.token, "chat.postMessage", { channel: to, ...buildSlackMessage(reply) });
  return { message_id: sent.ts };
}

/** First and last name for a new contact. Needs the users:read scope; without it the contact stays unnamed. */
export async function fetchSlackProfile(account: ChannelAccount, userId: string) {
  try {
    const info = await slackRequest<SlackResponse & { user: { name?: string; real_name?: string; profile?: { image_72?: string } } }>(account.token, "users.info", { user: userId });
    const [first, ...rest] = (info.user.real_name ?? "").split(" ");
    return { firstName: first || null, lastName: rest.join(" ") || null, username: info.user.name ?? null };
  } catch {
    return null;
  }
}

export type SlackPayload = {
  type?: string;
  challenge?: string;
  event_id?: string;
  /** Workspace the delivery came from. Events carry team_id, button taps carry team. */
  team_id?: string;
  team?: { id?: string };
  event?: {
    type?: string;
    subtype?: string;
    channel_type?: string;
    user?: string;
    bot_id?: string;
    text?: string;
    ts?: string;
    files?: unknown[];
  };
  user?: { id?: string; username?: string; name?: string; team_id?: string };
  actions?: { action_id?: string; value?: string; type?: string; text?: { text?: string } }[];
  container?: { message_ts?: string };
  trigger_id?: string;
};

/**
 * Normalize an Events API delivery or a button tap (block_actions). Only direct messages count: channel
 * chatter, bot messages (including this app's own) and edits or deletes are ignored.
 */
export function parseSlackEvent(payload: SlackPayload): NormalizedInbound[] {
  if (payload?.type === "event_callback") {
    const event = payload.event;
    if (!event || event.type !== "message" || event.channel_type !== "im") return [];
    if (event.bot_id || !event.user) return [];
    if (event.subtype && event.subtype !== "file_share") return [];
    const text = event.text?.trim() || (event.files?.length ? "[attachment]" : null);
    return [{ externalUserId: event.user, text, externalMessageId: event.ts ?? null }];
  }
  if (payload?.type === "block_actions") {
    const user = payload.user;
    const action = payload.actions?.[0];
    if (!user?.id || !action?.value) return [];
    const quick = action.value.startsWith("qr:");
    return [
      {
        externalUserId: user.id,
        username: user.username ?? user.name ?? null,
        text: quick ? action.value.slice(3) : null,
        callbackData: isRelayPayload(action.value) ? action.value : null,
        callbackTitle: action.text?.text ?? null,
        externalMessageId: payload.trigger_id ?? null,
      },
    ];
  }
  return [];
}
