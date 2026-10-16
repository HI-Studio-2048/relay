import type { ChannelAccount, ChannelTarget, NormalizedInbound, SentMessage } from "@/lib/channels/types";
import type { OutboundReply } from "@/lib/types";

/**
 * YouTube comments as a channel. Comments on the connected channel's videos come in as comment events,
 * and replies go back as public replies under the comment. YouTube has no private messages, so the
 * only thing that ever posts is a reply a person wrote in Live Chat or a comment automation's public reply.
 * Tokens come from the Google connection (`oauth_connections`) and are refreshed there.
 */
const API = "https://www.googleapis.com/youtube/v3";
const MAX_REPLY_CHARS = 10_000;

type Fetcher = typeof fetch;

export class YouTubeError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "YouTubeError";
  }
}

/** A top-level comment on one of the channel's videos. `threadId` is what a reply is posted under. */
export type YouTubeCommentEvent = {
  type: "youtube_comment";
  threadId: string;
  commentId: string;
  videoId: string;
  authorChannelId: string;
  authorName: string | null;
  authorAvatar: string | null;
  text: string;
  publishedAt: string;
};

type CommentSnippet = {
  authorDisplayName?: string;
  authorProfileImageUrl?: string;
  authorChannelId?: { value?: string };
  textOriginal?: string;
  textDisplay?: string;
  publishedAt?: string;
  videoId?: string;
};

type CommentThread = {
  id?: string;
  snippet?: { videoId?: string; topLevelComment?: { id?: string; snippet?: CommentSnippet } };
};

type ApiError = { error?: { message?: string; errors?: { reason?: string }[] } };

async function token(account: ChannelAccount): Promise<string> {
  if (account.token) return account.token;
  if (!account.connectionId) throw new YouTubeError("This YouTube account has no Google sign-in. Connect it again.");
  const { getConnectionAccessToken } = await import("@/lib/oauth/connections");
  return getConnectionAccessToken(account.connectionId);
}

async function call<T>(account: ChannelAccount, path: string, init: RequestInit = {}, fetcher: Fetcher = fetch): Promise<T> {
  const response = await fetcher(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await token(account)}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  if (response.status === 204) return {} as T;
  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    throw new YouTubeError(`YouTube refused the request${data.error?.message ? `: ${data.error.message}` : reason ? `: ${reason}` : ""}`, response.status);
  }
  return data;
}

const isAfter = (value: string | undefined, since: string) => Boolean(value) && Date.parse(value!) > Date.parse(since);

/** Top-level comments newer than `since`, skipping the channel's own. */
export function commentsFromThreads(items: CommentThread[], ownChannelId: string, since: string): YouTubeCommentEvent[] {
  const events: YouTubeCommentEvent[] = [];
  for (const item of items) {
    const top = item.snippet?.topLevelComment;
    const snippet = top?.snippet;
    const author = snippet?.authorChannelId?.value;
    const videoId = item.snippet?.videoId ?? snippet?.videoId;
    if (!item.id || !top?.id || !author || !videoId || author === ownChannelId) continue;
    if (!isAfter(snippet?.publishedAt, since)) continue;
    const text = (snippet?.textOriginal ?? snippet?.textDisplay ?? "").trim();
    if (!text) continue;
    events.push({
      type: "youtube_comment",
      threadId: item.id,
      commentId: top.id,
      videoId,
      authorChannelId: author,
      authorName: snippet?.authorDisplayName ?? null,
      authorAvatar: snippet?.authorProfileImageUrl ?? null,
      text,
      publishedAt: snippet!.publishedAt!,
    });
  }
  return events;
}

export type CommentPage = { events: YouTubeCommentEvent[]; since: string };

/**
 * New comments on the channel's videos since the last look, oldest first. YouTube lists them newest first,
 * so this pages back until it reaches `since`. With no `since` it only records where things stand, so
 * comments from before the channel was connected are never answered. Each page costs one unit of quota.
 */
export async function pollYouTubeComments(account: ChannelAccount, since: string | null, now = new Date(), fetcher: Fetcher = fetch): Promise<CommentPage> {
  const channelId = account.externalAccountId ?? "";
  const events: YouTubeCommentEvent[] = [];
  let newest = since;
  let pageToken: string | undefined;
  for (let page = 0; page < 4; page++) {
    const query = new URLSearchParams({ part: "snippet", allThreadsRelatedToChannelId: channelId, order: "time", maxResults: "50", textFormat: "plainText" });
    if (pageToken) query.set("pageToken", pageToken);
    const result = await call<{ items?: CommentThread[]; nextPageToken?: string }>(account, `/commentThreads?${query}`, {}, fetcher);
    const items = result.items ?? [];
    for (const item of items) {
      const at = item.snippet?.topLevelComment?.snippet?.publishedAt;
      if (at && (!newest || isAfter(at, newest))) newest = at;
    }
    if (!since) break;
    events.push(...commentsFromThreads(items, channelId, since));
    const reachedSince = items.some((item) => !isAfter(item.snippet?.topLevelComment?.snippet?.publishedAt, since));
    if (!result.nextPageToken || items.length === 0 || reachedSince) break;
    pageToken = result.nextPageToken;
  }
  if (!since) return { events: [], since: newest ?? now.toISOString() };
  return { events: events.reverse(), since: newest ?? since };
}

/** Post a public reply under a comment thread. Returns the new comment's id. */
export async function replyToYouTubeComment(account: ChannelAccount, threadId: string, text: string, fetcher: Fetcher = fetch): Promise<string> {
  const chars = Array.from(text.trim());
  if (!chars.length) throw new YouTubeError("The reply is empty");
  const body = chars.length > MAX_REPLY_CHARS ? `${chars.slice(0, MAX_REPLY_CHARS - 1).join("")}…` : chars.join("");
  const created = await call<{ id?: string }>(
    account,
    "/comments?part=snippet",
    { method: "POST", body: JSON.stringify({ snippet: { parentId: threadId, textOriginal: body } }) },
    fetcher,
  );
  return created.id ?? "";
}

/** Hold a comment for review: it disappears from the video until the channel approves it in YouTube Studio. */
export async function holdYouTubeComment(account: ChannelAccount, commentId: string, fetcher: Fetcher = fetch) {
  const query = new URLSearchParams({ id: commentId, moderationStatus: "heldForReview" });
  await call(account, `/comments/setModerationStatus?${query}`, { method: "POST" }, fetcher);
}

/** A reply typed in Live Chat (or sent through the API): button labels and links go in as plain text. */
function replyText(reply: OutboundReply): string {
  const links = (reply.buttons ?? []).filter((button) => button.url).map((button) => `${button.text}: ${button.url}`);
  return [reply.text.trim(), ...links].filter(Boolean).join("\n");
}

/**
 * YouTube has no private messages, so a "send" is a public reply under the person's latest comment.
 * Only replies a person wrote go out this way. Broadcasts, follow-ups and surveys are refused, so nothing
 * automatic is ever posted in public apart from a comment automation's own public reply.
 */
export async function sendYouTubeReply(account: ChannelAccount, target: ChannelTarget, reply: OutboundReply, fetcher: Fetcher = fetch): Promise<SentMessage> {
  if (reply.source !== "agent") throw new YouTubeError("YouTube has no private messages. Only replies written in Live Chat are posted, under the person's comment.");
  if (!target.threadId) throw new YouTubeError("There is no comment from this person to reply under");
  const id = await replyToYouTubeComment(account, target.threadId, replyText(reply), fetcher);
  return { message_id: id };
}

export function youtubeEventId(event: YouTubeCommentEvent): string {
  return `yt:${event.commentId}`;
}

export function parseYouTubeEvent(event: YouTubeCommentEvent): NormalizedInbound[] {
  if (event?.type !== "youtube_comment" || !event.authorChannelId || !event.text) return [];
  const [first, ...rest] = (event.authorName ?? "").replace(/^@/, "").trim().split(" ");
  return [
    {
      externalUserId: event.authorChannelId,
      username: event.authorName?.startsWith("@") ? event.authorName.slice(1) : null,
      firstName: first || null,
      lastName: rest.join(" ") || null,
      text: event.text,
      externalMessageId: event.commentId,
      kind: "comment",
      platform: "youtube",
      // Later replies from Live Chat go under the person's latest comment.
      threadId: event.threadId,
      avatarUrl: event.authorAvatar,
      comment: {
        id: event.commentId,
        postId: event.videoId,
        platformPostId: event.videoId,
        isReply: false,
        permalink: `https://www.youtube.com/watch?v=${event.videoId}&lc=${event.commentId}`,
      },
    },
  ];
}
