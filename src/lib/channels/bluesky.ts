import { renderForChannel } from "@/lib/channels/format";
import { absoluteMediaUrl, ChannelApiError } from "@/lib/channels/meta";
import { CHANNELS, type ChannelAccount, type NormalizedInbound, type SentMessage } from "@/lib/channels/types";
import { log } from "@/lib/logger";
import type { OutboundReply } from "@/lib/types";

const PDS = "https://bsky.social";
const PUBLIC_API = "https://public.api.bsky.app";
/** Chat lives on its own service; the PDS forwards requests that carry this header. */
const CHAT_PROXY = "did:web:api.bsky.chat#bsky_chat";
/** Notifications and other app reads go to Bluesky's app view, also through the account's own server. */
const APPVIEW_PROXY = "did:web:api.bsky.app#bsky_appview";
const MAX_CHARS = 1000;
/** A post, and so a public reply, holds at most 300 characters. */
const MAX_POST_CHARS = 300;

class BlueskyError extends ChannelApiError {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

type Session = {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
  didDoc?: { service?: { id?: string; serviceEndpoint?: string }[] };
};

/**
 * bsky.social is only the sign-in entryway. Chat requests must go to the account's own server, which the
 * sign-in response names in its DID document; the entryway answers them with "Method Not Implemented".
 */
export function pdsOf(session: Session): string {
  const endpoint = session.didDoc?.service?.find((service) => service.id === "#atproto_pds")?.serviceEndpoint;
  return endpoint && /^https:\/\//.test(endpoint) ? endpoint.replace(/\/$/, "") : PDS;
}
type XrpcError = { error?: string; message?: string };

/**
 * Sessions are cached per account so a poll every few seconds does not hit createSession's rate limit.
 * Held on globalThis so a dev reload keeps them.
 */
const store = globalThis as unknown as { __relayBluesky?: Map<string, Session> };
const sessions = (store.__relayBluesky ??= new Map<string, Session>());

async function xrpc<T>(method: "GET" | "POST", nsid: string, opts: { jwt?: string; query?: Record<string, string>; body?: unknown; proxy?: string; base?: string } = {}): Promise<T> {
  const url = new URL(`${opts.base ?? PDS}/xrpc/${nsid}`);
  for (const [key, value] of Object.entries(opts.query ?? {})) url.searchParams.set(key, value);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.jwt) headers.authorization = `Bearer ${opts.jwt}`;
  if (opts.proxy) headers["atproto-proxy"] = opts.proxy;
  const response = await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const data = (await response.json().catch(() => ({}))) as T & XrpcError;
  if (!response.ok) {
    const code = data.error ?? `http_${response.status}`;
    throw new BlueskyError(`Bluesky: ${data.message ?? code}`, response.status, code);
  }
  return data;
}

/** Sign in with a handle and an app password. Not cached; connecting and health checks call this directly. */
export function createBlueskySession(identifier: string, password: string) {
  return xrpc<Session>("POST", "com.atproto.server.createSession", { body: { identifier: identifier.trim().replace(/^@/, ""), password: password.trim() } });
}

function jwtExpiry(jwt: string): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

/** A working session for this account: the cached one, a refreshed one, or a fresh sign-in, in that order. */
export async function blueskySession(account: Pick<ChannelAccount, "id" | "token" | "handle" | "externalAccountId">, now = Date.now()): Promise<Session> {
  const cached = sessions.get(account.id);
  if (cached && jwtExpiry(cached.accessJwt) - now > 60_000) return cached;
  if (cached && jwtExpiry(cached.refreshJwt) - now > 60_000) {
    try {
      const refreshed = await xrpc<Session>("POST", "com.atproto.server.refreshSession", { jwt: cached.refreshJwt, base: pdsOf(cached) });
      sessions.set(account.id, refreshed);
      return refreshed;
    } catch {
      // fall through to a fresh sign-in
    }
  }
  const session = await createBlueskySession(account.handle || account.externalAccountId || "", account.token);
  sessions.set(account.id, session);
  return session;
}

export function forgetBlueskySession(accountId: string) {
  sessions.delete(accountId);
}

type CallData = { query?: Record<string, string>; body?: unknown; proxy?: string };

/** One call through the account's OAuth session, which signs and refreshes itself. */
async function callWithOauth<T>(account: ChannelAccount, method: "GET" | "POST", nsid: string, data: CallData): Promise<T> {
  const { restoreBlueskySession } = await import("@/lib/channels/bluesky-oauth");
  let session;
  try {
    session = await restoreBlueskySession(account.externalAccountId ?? "");
  } catch {
    throw new BlueskyError("Bluesky: the sign-in expired or was revoked. Reconnect the account with Sign in with Bluesky.", 401, "ReauthRequired");
  }
  const query = data.query ? `?${new URLSearchParams(data.query)}` : "";
  const response = await session.fetchHandler(`/xrpc/${nsid}${query}`, {
    method,
    headers: { ...(data.proxy ? { "atproto-proxy": data.proxy } : {}), ...(data.body === undefined ? {} : { "content-type": "application/json" }) },
    body: data.body === undefined ? undefined : JSON.stringify(data.body),
  });
  const parsed = (await response.json().catch(() => ({}))) as T & XrpcError;
  if (!response.ok) throw new BlueskyError(`Bluesky: ${parsed.message ?? parsed.error ?? "request failed"}`, response.status, parsed.error ?? `http_${response.status}`);
  return parsed;
}

/** One call as the account. A rejected token drops the cached session and tries once more. */
async function call<T>(account: ChannelAccount, method: "GET" | "POST", nsid: string, data: CallData = {}, retried = false): Promise<T> {
  if (account.oauth) return callWithOauth<T>(account, method, nsid, data);
  const session = await blueskySession(account);
  try {
    return await xrpc<T>(method, nsid, { jwt: session.accessJwt, base: pdsOf(session), ...data });
  } catch (error) {
    if (!retried && error instanceof BlueskyError && (error.status === 401 || error.code === "ExpiredToken" || error.code === "InvalidToken")) {
      forgetBlueskySession(account.id);
      return call<T>(account, method, nsid, data, true);
    }
    throw error;
  }
}

function chat<T>(account: ChannelAccount, method: "GET" | "POST", nsid: string, data: Omit<CallData, "proxy"> = {}): Promise<T> {
  return call<T>(account, method, nsid, { ...data, proxy: CHAT_PROXY });
}

/** The message you get when an app password was made without the "Allow access to direct messages" box ticked. */
export function explainBlueskyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Bluesky check failed";
  if (/bad token scope|token scope/i.test(message)) {
    return "This app password cannot read direct messages. Make a new one in Bluesky settings with 'Allow access to your direct messages' ticked.";
  }
  return message;
}

/** Sign in and make sure DMs are reachable. Used when connecting and by the health check. */
export async function checkBlueskyAccount(identifier: string, password: string) {
  const session = await createBlueskySession(identifier, password);
  try {
    await xrpc("GET", "chat.bsky.convo.listConvos", { jwt: session.accessJwt, proxy: CHAT_PROXY, base: pdsOf(session), query: { limit: "1" } });
  } catch (error) {
    throw new ChannelApiError(explainBlueskyError(error));
  }
  return session;
}

type Facet = { index: { byteStart: number; byteEnd: number }; features: { $type: string; uri: string }[] };

/** Link facets so URLs in a message are tappable. Offsets are UTF-8 byte positions, as Bluesky expects. */
export function linkFacets(text: string): Facet[] {
  const encoder = new TextEncoder();
  const facets: Facet[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s]+/g)) {
    const url = match[0].replace(/[.,;:!?)\]]+$/, "");
    const start = encoder.encode(text.slice(0, match.index)).length;
    facets.push({ index: { byteStart: start, byteEnd: start + encoder.encode(url).length }, features: [{ $type: "app.bsky.richtext.facet#link", uri: url }] });
  }
  return facets;
}

export type BlueskyMessageBody = { text: string; facets?: Facet[] };

/**
 * Bluesky DMs are text only. Buttons become a numbered list and quick replies a bullet list; the flow
 * engine maps a typed number or label back to the button. Images and files go out as links.
 */
export function buildBlueskyMessage(reply: OutboundReply): BlueskyMessageBody {
  const lines = [renderForChannel(reply.text ?? "", CHANNELS.bluesky).trim()];
  if (reply.media) {
    const link = absoluteMediaUrl(reply.media);
    if (link) lines.push(link);
    else log.warn("Bluesky media skipped: set PUBLIC_URL so uploads have a public address");
  }
  (reply.buttons ?? []).forEach((button, index) => {
    lines.push(button.url ? `${button.text}: ${button.url}` : `${(reply.buttonNumberOffset ?? 0) + index + 1}. ${button.text}`);
  });
  for (const title of reply.keyboard ?? []) lines.push(`• ${title}`);

  let text = lines.filter(Boolean).join("\n");
  const chars = Array.from(text);
  if (chars.length > MAX_CHARS) text = `${chars.slice(0, MAX_CHARS - 1).join("")}…`;
  if (!text) text = "…";
  const facets = linkFacets(text);
  return facets.length ? { text, facets } : { text };
}

/** The DM thread with one person. Bluesky returns the same one every time. */
async function convoWith(account: ChannelAccount, did: string): Promise<string> {
  const found = await chat<{ convo: { id: string } }>(account, "GET", "chat.bsky.convo.getConvoForMembers", { query: { members: did } });
  return found.convo.id;
}

export async function sendBlueskyReply(account: ChannelAccount, to: string, reply: OutboundReply): Promise<SentMessage> {
  const convoId = await convoWith(account, to);
  const sent = await chat<{ id: string }>(account, "POST", "chat.bsky.convo.sendMessage", { body: { convoId, message: buildBlueskyMessage(reply) } });
  return { message_id: sent.id };
}

/** The handle that goes with an account id, from the public profile. Null when Bluesky cannot say. */
export async function fetchBlueskyHandle(did: string): Promise<string | null> {
  try {
    const profile = await xrpc<{ handle?: string }>("GET", "app.bsky.actor.getProfile", { base: PUBLIC_API, query: { actor: did } });
    return profile.handle ?? null;
  } catch {
    return null;
  }
}

/** Name and avatar for a new contact, from the public profile. */
export async function fetchBlueskyProfile(_account: ChannelAccount, did: string) {
  try {
    const profile = await xrpc<{ handle?: string; displayName?: string }>("GET", "app.bsky.actor.getProfile", { base: PUBLIC_API, query: { actor: did } });
    const [first, ...rest] = (profile.displayName ?? "").trim().split(" ");
    return { firstName: first || null, lastName: rest.join(" ") || null, username: profile.handle ?? null };
  } catch {
    return null;
  }
}

/** What the poller hands to the queue: one new message from one person. */
export type BlueskyEvent = {
  did: string;
  convoId: string;
  messageId: string;
  text: string;
  sentAt?: string;
};

type LogEntry = {
  $type?: string;
  convoId?: string;
  message?: { $type?: string; id?: string; text?: string; sender?: { did?: string }; sentAt?: string; embed?: unknown };
};

/** New incoming messages in a chat log page. The account's own messages and edits or deletes are skipped. */
export function eventsFromLog(logs: LogEntry[], ownDid: string): BlueskyEvent[] {
  const events: BlueskyEvent[] = [];
  for (const entry of logs) {
    if (entry.$type !== "chat.bsky.convo.defs#logCreateMessage") continue;
    const message = entry.message;
    const did = message?.sender?.did;
    if (!message?.id || !did || did === ownDid || !entry.convoId) continue;
    if (message.$type && message.$type !== "chat.bsky.convo.defs#messageView") continue;
    const text = message.text?.trim() || (message.embed ? "[attachment]" : "");
    if (!text) continue;
    events.push({ did, convoId: entry.convoId, messageId: message.id, text, sentAt: message.sentAt });
  }
  return events;
}

export type LogPage = { events: BlueskyEvent[]; cursor: string | null; more: boolean };

/**
 * One page of the account's chat log from `cursor`. With no cursor this is the first look at the account,
 * so it returns the latest position without events: old conversations must not be answered.
 */
export async function pollBlueskyLog(account: ChannelAccount, cursor: string | null): Promise<LogPage> {
  const ownDid = account.externalAccountId ?? "";
  const page = await chat<{ cursor?: string; logs?: LogEntry[] }>(account, "GET", "chat.bsky.convo.getLog", cursor ? { query: { cursor } } : {});
  const logs = page.logs ?? [];
  const next = page.cursor ?? cursor;
  if (!cursor) return { events: [], cursor: next, more: false };
  return { events: eventsFromLog(logs, ownDid), cursor: next, more: logs.length > 0 && next !== cursor };
}

/** Message requests from people the account does not follow stay hidden until accepted. Best effort. */
export async function acceptBlueskyConvo(account: ChannelAccount, convoId: string) {
  try {
    await chat(account, "POST", "chat.bsky.convo.acceptConvo", { body: { convoId } });
  } catch {
    // Already accepted, or not a request.
  }
}

/**
 * A reply under one of the account's own posts: Bluesky's version of a comment. `uri` and `cid` name the
 * reply itself, `rootUri` and `rootCid` the account's post at the top of the thread. Replying needs both.
 */
export type BlueskyCommentEvent = {
  type: "comment";
  did: string;
  handle?: string | null;
  displayName?: string | null;
  uri: string;
  cid: string;
  text: string;
  rootUri: string;
  rootCid: string;
  parentUri: string;
  indexedAt: string;
};

type Notification = {
  uri?: string;
  cid?: string;
  reason?: string;
  indexedAt?: string;
  author?: { did?: string; handle?: string; displayName?: string };
  record?: { text?: string; embed?: unknown; reply?: { root?: { uri?: string; cid?: string }; parent?: { uri?: string; cid?: string } } };
};

const isAfter = (value: string | undefined, since: string) => Boolean(value) && Date.parse(value!) > Date.parse(since);

/** Replies newer than `since` in threads the account started. Its own replies, and replies in other people's threads, are skipped. */
export function commentsFromNotifications(items: Notification[], ownDid: string, since: string): BlueskyCommentEvent[] {
  const events: BlueskyCommentEvent[] = [];
  for (const item of items) {
    if (item.reason !== "reply" || !isAfter(item.indexedAt, since)) continue;
    const did = item.author?.did;
    const root = item.record?.reply?.root;
    if (!did || did === ownDid || !item.uri || !item.cid || !root?.uri || !root.cid) continue;
    if (!root.uri.startsWith(`at://${ownDid}/`)) continue;
    const text = item.record?.text?.trim() || (item.record?.embed ? "[attachment]" : "");
    if (!text) continue;
    events.push({
      type: "comment",
      did,
      handle: item.author?.handle ?? null,
      displayName: item.author?.displayName ?? null,
      uri: item.uri,
      cid: item.cid,
      text,
      rootUri: root.uri,
      rootCid: root.cid,
      parentUri: item.record?.reply?.parent?.uri ?? root.uri,
      indexedAt: item.indexedAt!,
    });
  }
  return events;
}

export type ReplyPage = { events: BlueskyCommentEvent[]; since: string };

/**
 * New replies to the account's posts since the last look, oldest first. Bluesky lists notifications newest
 * first, so this pages back until it reaches `since`. With no `since` it only records where things stand,
 * like the chat log, so replies from before the account was connected are never answered.
 */
export async function pollBlueskyReplies(account: ChannelAccount, since: string | null, now = new Date()): Promise<ReplyPage> {
  const ownDid = account.externalAccountId ?? "";
  const events: BlueskyCommentEvent[] = [];
  let newest = since;
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const result = await call<{ cursor?: string; notifications?: Notification[] }>(account, "GET", "app.bsky.notification.listNotifications", {
      proxy: APPVIEW_PROXY,
      query: { reasons: "reply", limit: "50", ...(cursor ? { cursor } : {}) },
    });
    const items = result.notifications ?? [];
    for (const item of items) if (item.indexedAt && (!newest || isAfter(item.indexedAt, newest))) newest = item.indexedAt;
    if (!since) break;
    events.push(...commentsFromNotifications(items, ownDid, since));
    if (!result.cursor || items.length === 0 || items.some((item) => !isAfter(item.indexedAt, since))) break;
    cursor = result.cursor;
  }
  if (!since) return { events: [], since: newest ?? now.toISOString() };
  return { events: events.reverse(), since: newest ?? since };
}

export type BlueskyCommentRef = { uri: string; cid: string; rootUri: string; rootCid: string };

/** Post a public reply under a comment, in the same thread. Returns the new post's address. */
export async function replyToBlueskyComment(account: ChannelAccount, ref: BlueskyCommentRef, text: string): Promise<string> {
  const chars = Array.from(text.trim());
  const body = chars.length > MAX_POST_CHARS ? `${chars.slice(0, MAX_POST_CHARS - 1).join("")}…` : chars.join("");
  const facets = linkFacets(body);
  const created = await call<{ uri: string }>(account, "POST", "com.atproto.repo.createRecord", {
    body: {
      repo: account.externalAccountId,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text: body,
        createdAt: new Date().toISOString(),
        reply: { root: { uri: ref.rootUri, cid: ref.rootCid }, parent: { uri: ref.uri, cid: ref.cid } },
        ...(facets.length ? { facets } : {}),
      },
    },
  });
  return created.uri;
}

const rkeyOf = (uri: string) => uri.split("/").pop() ?? "";

const isComment = (event: BlueskyEvent | BlueskyCommentEvent): event is BlueskyCommentEvent => (event as BlueskyCommentEvent).type === "comment";

export function blueskyEventId(event: BlueskyEvent | BlueskyCommentEvent): string {
  return isComment(event) ? `reply:${event.uri}` : `${event.convoId}:${event.messageId}`;
}

export function parseBlueskyEvent(event: BlueskyEvent | BlueskyCommentEvent): NormalizedInbound[] {
  if (!event?.did || !event.text) return [];
  if (isComment(event)) {
    const [first, ...rest] = (event.displayName ?? "").trim().split(" ");
    const owner = event.rootUri.split("/")[2];
    return [
      {
        externalUserId: event.did,
        username: event.handle ?? null,
        firstName: first || null,
        lastName: rest.join(" ") || null,
        text: event.text,
        externalMessageId: event.uri,
        kind: "comment",
        platform: "bluesky",
        comment: {
          id: event.uri,
          postId: event.rootUri,
          platformPostId: rkeyOf(event.rootUri),
          isReply: event.parentUri !== event.rootUri,
          permalink: `https://bsky.app/profile/${owner}/post/${rkeyOf(event.rootUri)}`,
          cid: event.cid,
          rootCid: event.rootCid,
        },
      },
    ];
  }
  return [{ externalUserId: event.did, text: event.text, externalMessageId: event.messageId }];
}
