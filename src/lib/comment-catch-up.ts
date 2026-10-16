import { and, eq, gte } from "drizzle-orm";
import { accountFromRow } from "@/lib/channels";
import type { NormalizedInbound } from "@/lib/channels/types";
import { listZernioPostComments, listZernioPosts, splitName, zernioContactKey, type ZernioPost } from "@/lib/channels/zernio";
import { getDb } from "@/lib/db";
import { bots, flowEvents, flows } from "@/lib/db/schema";
import { alreadyAnswered, matchSocialFlow } from "@/lib/social-triggers";
import { findContactByTelegram } from "@/lib/store";
import type { FlowDefinition, TriggerType } from "@/lib/types";
import { processCatchUpComments } from "@/lib/webhook";

/**
 * Comments that came in while no flow answered them (the flow was off, or had the wrong keyword) can
 * still get the DM: Instagram allows a private reply to a comment for 7 days. Each one runs through
 * the normal comment path with catchUp set, so it gets the DM and the button flow, but no public reply.
 */
export const PRIVATE_REPLY_DAYS = 7;

export class CatchUpError extends Error {}

type LinkedAccount = { id: string; platform: string; username: string | null };

async function loadTarget(flowId: string) {
  const db = await getDb();
  const [flow] = await db.select().from(flows).where(eq(flows.id, flowId)).limit(1);
  if (!flow) throw new CatchUpError("Flow not found");
  if (flow.triggerType !== "comment") throw new CatchUpError("Only comment flows can reply to missed comments");
  const [bot] = await db.select().from(bots).where(eq(bots.id, flow.botId)).limit(1);
  if (!bot || bot.channel !== "zernio") throw new CatchUpError("Missed comments work for Instagram and Facebook accounts");
  // Only these two allow a private reply to a comment.
  const accounts = ((bot.settings?.zernioAccounts as LinkedAccount[] | undefined) ?? []).filter(
    (account) => account.platform === "instagram" || account.platform === "facebook",
  );
  return { flow, bot, accounts, token: accountFromRow(bot).token };
}

export type CatchUpPost = ZernioPost & { accountId: string; platform: string; username: string | null };

export async function listCatchUpPosts(flowId: string): Promise<CatchUpPost[]> {
  const { accounts, token } = await loadTarget(flowId);
  const lists = await Promise.all(
    accounts.map(async (account) =>
      (await listZernioPosts(token, account.id)).map((post) => ({ ...post, accountId: account.id, platform: account.platform, username: account.username })),
    ),
  );
  return lists.flat().sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export type MissedComment = {
  commentId: string;
  authorId: string;
  username: string | null;
  name: string | null;
  text: string;
  createdAt: string | null;
  isReply: boolean;
};

/** People whose comment on this post matches the flow but who never got its DM. One entry per person, their first comment. */
export async function findMissedComments(flowId: string, accountId: string, postId: string, now = Date.now()): Promise<MissedComment[]> {
  const { flow, bot, accounts, token } = await loadTarget(flowId);
  if (!accounts.some((account) => account.id === accountId)) throw new CatchUpError("That account is not connected here");
  const comments = await listZernioPostComments(token, accountId, postId);
  const record = {
    id: flow.id,
    triggerType: flow.triggerType as TriggerType,
    triggerValue: flow.triggerValue,
    isActive: flow.isActive,
    definition: flow.definition as FlowDefinition,
  };
  const oldest = now - PRIVATE_REPLY_DAYS * 24 * 60 * 60 * 1000;
  const firstByAuthor = new Map<string, MissedComment>();
  for (const comment of comments) {
    if (!comment.author.id || comment.author.isOwner || !comment.canReply) continue;
    // Leave a margin: Instagram counts the 7 days itself, and a reply right at the edge just fails.
    if (comment.createdAt && Date.parse(comment.createdAt) < oldest + 60 * 60 * 1000) continue;
    // Same rules a live comment goes through: keywords, chosen posts, replies on or off. An inactive flow matches nothing.
    if (!matchSocialFlow([record], { kind: "comment", text: comment.text, postId, platformPostId: postId, isReply: comment.isReply })) continue;
    const earlier = firstByAuthor.get(comment.author.id);
    if (earlier && (earlier.createdAt ?? "") <= (comment.createdAt ?? "")) continue;
    firstByAuthor.set(comment.author.id, {
      commentId: comment.id,
      authorId: comment.author.id,
      username: comment.author.username,
      name: comment.author.name,
      text: comment.text,
      createdAt: comment.createdAt,
      isReply: comment.isReply,
    });
  }
  const missed: MissedComment[] = [];
  for (const comment of firstByAuthor.values()) {
    const contact = await findContactByTelegram(bot.id, zernioContactKey(accountId, comment.authorId));
    if (contact && alreadyAnswered(contact, flow.id, postId)) continue;
    missed.push(comment);
  }
  return missed.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

const running = new Set<string>();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send the DM to the next `limit` people on the missed list. The page calls this repeatedly until
 * nothing remains, so one request never runs long. Two at once for the same flow could DM someone twice,
 * so the second is refused.
 */
export async function sendMissedComments(input: { flowId: string; accountId: string; postId: string; limit?: number; gapMs?: number }) {
  if (running.has(input.flowId)) throw new CatchUpError("Already sending for this flow");
  running.add(input.flowId);
  try {
    const { flow, bot, accounts } = await loadTarget(input.flowId);
    const platform = accounts.find((account) => account.id === input.accountId)?.platform ?? "instagram";
    const missed = await findMissedComments(input.flowId, input.accountId, input.postId);
    const batch = missed.slice(0, Math.max(1, Math.min(input.limit ?? 20, 50)));
    const startedAt = new Date();
    for (const [index, comment] of batch.entries()) {
      if (index > 0) await pause(input.gapMs ?? 1500);
      const inbound: NormalizedInbound = {
        externalUserId: zernioContactKey(input.accountId, comment.authorId),
        username: comment.username,
        ...splitName(comment.name),
        text: comment.text,
        externalMessageId: comment.commentId,
        kind: "comment",
        platform,
        channelAccountId: input.accountId,
        threadId: null,
        comment: { id: comment.commentId, postId: input.postId, platformPostId: input.postId, isReply: comment.isReply, postCaption: null, permalink: null },
      };
      await processCatchUpComments(bot.id, [inbound]);
    }
    // A DM that went out leaves a "sent" event; one Instagram refused leaves none (and the person is not retried).
    const db = await getDb();
    const sentRows = await db
      .select({ contactId: flowEvents.contactId })
      .from(flowEvents)
      .where(and(eq(flowEvents.flowId, flow.id), eq(flowEvents.kind, "sent"), gte(flowEvents.createdAt, startedAt)));
    const sent = new Set(sentRows.map((row) => row.contactId)).size;
    return { sent, failed: batch.length - sent, remaining: missed.length - batch.length };
  } finally {
    running.delete(input.flowId);
  }
}
