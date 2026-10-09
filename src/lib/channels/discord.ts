import { renderForChannel } from "@/lib/channels/format";
import { absoluteMediaUrl, ChannelApiError } from "@/lib/channels/meta";
import { CHANNELS, isRelayPayload, type ChannelAccount, type NormalizedInbound, type SentMessage } from "@/lib/channels/types";
import { log } from "@/lib/logger";
import type { OutboundReply } from "@/lib/types";

const API = "https://discord.com/api/v10";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

type DiscordError = { message?: string; retry_after?: number };

/**
 * One Discord REST call as a bot. Retries a rate limit once after the wait Discord asks for, so a
 * burst of replies slows down instead of failing.
 */
export async function discordRequest<T>(token: string, method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "DiscordBot (https://recatch.app, 1.0)" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 429 && attempt < 2) {
    const info = (await response.json().catch(() => ({}))) as DiscordError;
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.ceil((info.retry_after ?? 1) * 1000), 10_000)));
    return discordRequest<T>(token, method, path, body, attempt + 1);
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as T & DiscordError;
  if (!response.ok) throw new ChannelApiError(data.message ? `Discord: ${data.message}` : `Discord request failed (${response.status})`);
  return data;
}

export type DiscordBotUser = { id: string; username: string; discriminator?: string; global_name?: string | null };

/** Who this token belongs to. Doubles as the "is the token valid" check when connecting. */
export function fetchDiscordBot(token: string) {
  return discordRequest<DiscordBotUser>(token, "GET", "/users/@me");
}

type DiscordComponent = Record<string, unknown>;
export type DiscordMessageBody = { content?: string; embeds?: Record<string, unknown>[]; components?: DiscordComponent[] };

/**
 * Discord message bodies for one engine reply. Callback buttons and quick replies become buttons
 * (5 to a row, 5 rows), URL buttons become link buttons, and an image rides along as an embed.
 */
export function buildDiscordMessage(reply: OutboundReply): DiscordMessageBody {
  const meta = CHANNELS.discord;
  const body: DiscordMessageBody = {};
  let content = renderForChannel(reply.text ?? "", meta).trim();

  const buttons: DiscordComponent[] = [];
  for (const button of reply.buttons ?? []) {
    if (button.url) buttons.push({ type: 2, style: 5, label: clip(button.text, 80), url: button.url });
    else buttons.push({ type: 2, style: 1, label: clip(button.text, 80), custom_id: clip(button.data ?? "n:", 100) });
  }
  for (const title of reply.keyboard ?? []) buttons.push({ type: 2, style: 2, label: clip(title, 80), custom_id: clip(`qr:${title}`, 100) });

  const rows: DiscordComponent[] = [];
  for (let i = 0; i < buttons.length && rows.length < 5; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5) });
  if (rows.length) body.components = rows;

  if (reply.media) {
    const link = absoluteMediaUrl(reply.media);
    if (!link) log.warn("Discord media skipped: set PUBLIC_URL so uploads have a public address");
    else if (reply.media.kind === "photo" || reply.media.kind === "animation") body.embeds = [{ image: { url: link } }];
    else content = [content, link].filter(Boolean).join("\n");
  }

  if (content) body.content = clip(content, 2000);
  if (!body.content && !body.embeds && !body.components) body.content = "​";
  else if (!body.content && body.components && !body.embeds) body.content = "Choose an option";
  return body;
}

/** The DM channel between this bot and a user. Discord returns the same one every time. */
async function openDm(token: string, userId: string): Promise<string> {
  const channel = await discordRequest<{ id: string }>(token, "POST", "/users/@me/channels", { recipient_id: userId });
  return channel.id;
}

export async function sendDiscordReply(account: ChannelAccount, to: string, reply: OutboundReply): Promise<SentMessage> {
  const channelId = await openDm(account.token, to);
  const sent = await discordRequest<{ id: string }>(account.token, "POST", `/channels/${channelId}/messages`, buildDiscordMessage(reply));
  return { message_id: sent.id };
}

export async function sendDiscordTyping(account: ChannelAccount, to: string) {
  const channelId = await openDm(account.token, to);
  await discordRequest<void>(account.token, "POST", `/channels/${channelId}/typing`);
}

/** Acknowledge a button tap so Discord stops showing "this interaction failed". Needs no auth, only the interaction token. */
export async function ackDiscordInteraction(ackId: string) {
  const [id, token] = ackId.split(":");
  if (!id || !token) return;
  await fetch(`${API}/interactions/${id}/${token}/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: 6 }),
  }).catch((error) => log.warn("Discord interaction ack failed", error instanceof Error ? error.message : error));
}

type DiscordUser = { id: string; username?: string; global_name?: string | null; bot?: boolean; avatar?: string | null };

/** What the Gateway client hands to the queue: one dispatch event, name and data. */
export type DiscordGatewayEvent = {
  t: "MESSAGE_CREATE" | "INTERACTION_CREATE";
  d: {
    id?: string;
    token?: string;
    type?: number;
    guild_id?: string;
    content?: string;
    author?: DiscordUser;
    user?: DiscordUser;
    member?: { user?: DiscordUser };
    attachments?: unknown[];
    data?: { custom_id?: string };
  };
};

function avatarOf(user: DiscordUser): string | null {
  return user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
}

function person(user: DiscordUser) {
  const [first, ...rest] = (user.global_name ?? user.username ?? "").split(" ");
  return {
    externalUserId: user.id,
    username: user.username ?? null,
    firstName: first || null,
    lastName: rest.join(" ") || null,
    avatarUrl: avatarOf(user),
  };
}

/**
 * Normalize a Gateway event. Only direct messages count: server chatter, other bots and the bot's
 * own messages are ignored, and a button tap works whether it happened in a DM or a server.
 */
export function parseDiscordEvent(event: DiscordGatewayEvent): NormalizedInbound[] {
  const d = event?.d;
  if (!d) return [];
  if (event.t === "MESSAGE_CREATE") {
    if (d.guild_id || !d.author || d.author.bot) return [];
    const text = d.content?.trim() || (d.attachments?.length ? "[attachment]" : null);
    return [{ ...person(d.author), text, externalMessageId: d.id ?? null }];
  }
  if (event.t === "INTERACTION_CREATE") {
    const user = d.user ?? d.member?.user;
    const customId = d.data?.custom_id;
    if (d.type !== 3 || !user || user.bot || !customId) return [];
    const quick = customId.startsWith("qr:");
    return [
      {
        ...person(user),
        text: quick ? customId.slice(3) : null,
        callbackData: isRelayPayload(customId) ? customId : null,
        externalMessageId: d.id ?? null,
        ackCallbackId: d.id && d.token ? `${d.id}:${d.token}` : null,
      },
    ];
  }
  return [];
}

/** A stable id for de-duplicating redelivered events after a Gateway resume. */
export function discordEventId(event: DiscordGatewayEvent): string | null {
  return event?.d?.id ? `${event.t}:${event.d.id}` : null;
}
