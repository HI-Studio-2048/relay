import { and, asc, eq } from "drizzle-orm";
import { CHANNELS, type ChannelId } from "@/lib/channels/types";
import { loadChecklist } from "@/lib/dashboard";
import { getDb } from "@/lib/db";
import { bots, flows, users } from "@/lib/db/schema";

/** Channels listed by name, and how many of them get a setup checklist, so a big workspace stays a short prompt. */
const MAX_CHANNELS = 12;
const MAX_CHECKLISTS = 3;

function channelLabel(channel: string) {
  return CHANNELS[channel as ChannelId]?.label ?? channel;
}

/** The first word of the login's name, for a greeting. Empty when they never gave one. */
export async function ownerFirstName(ownerId: string) {
  const db = await getDb();
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, ownerId)).limit(1);
  return user?.name?.trim().split(/\s+/)[0] ?? "";
}

/**
 * Facts the assistant gets fresh with every message: who is asking, what is connected, how far setup
 * has got, and whether they are talking out loud. They go after the prompt's cache breakpoint, so they
 * can change without paying for the instructions and tools again.
 */
export async function loadAssistantContext(ownerId: string, options: { voice?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const db = await getDb();
  const [firstName, channels, flowRows] = await Promise.all([
    ownerFirstName(ownerId),
    db
      .select({ id: bots.id, name: bots.name, channel: bots.channel, status: bots.status, handle: bots.telegramUsername, error: bots.lastHealthError })
      .from(bots)
      .where(eq(bots.ownerId, ownerId))
      .orderBy(asc(bots.createdAt), asc(bots.id)),
    db
      .select({ isActive: flows.isActive })
      .from(flows)
      .innerJoin(bots, eq(bots.id, flows.botId))
      .where(eq(bots.ownerId, ownerId)),
  ]);
  const lines = [
    "Workspace facts as of this message (newer than anything said earlier in the chat):",
    `- Today is ${new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(now)} (UTC).`,
  ];
  if (firstName) lines.push(`- The person signed in is ${firstName}.`);
  if (channels.length === 0) {
    lines.push("- No channels are connected yet. Connecting the first one on [Channels](/channels) comes before anything else.");
  } else {
    const listed = channels.slice(0, MAX_CHANNELS).map((bot) => {
      const parts = [channelLabel(bot.channel), bot.status, bot.handle ? `@${bot.handle.replace(/^@/, "")}` : "", `id ${bot.id}`].filter(Boolean);
      return `"${bot.name}" (${parts.join(", ")}${bot.error ? `, problem: ${bot.error.slice(0, 120)}` : ""})`;
    });
    const more = channels.length > MAX_CHANNELS ? `, and ${channels.length - MAX_CHANNELS} more` : "";
    lines.push(`- Channels (${channels.length}): ${listed.join("; ")}${more}.`);
    const live = flowRows.filter((row) => row.isActive).length;
    lines.push(`- Flows: ${live} on, ${flowRows.length - live} off or drafts.`);
    const checklists = await Promise.all(channels.slice(0, MAX_CHECKLISTS).map(async (bot) => ({ bot, items: await loadChecklist(bot.id) })));
    for (const { bot, items } of checklists) {
      const todo = items.filter((item) => !item.done);
      lines.push(
        todo.length === 0
          ? `- Setup on "${bot.name}" is complete.`
          : `- Setup on "${bot.name}", still to do: ${todo.map((item) => `${item.label} (${item.href})`).join("; ")}.`,
      );
    }
  }
  if (options.voice) {
    lines.push(
      "- They are talking to you out loud and hear your reply read aloud. Answer in one to three short sentences that sound natural spoken. No markdown, lists, links, URLs or emoji. Name the page instead, like \"open Flows\".",
    );
  }
  return lines.join("\n");
}

/** Openers for an empty chat, matched to how far the workspace has got. */
export async function assistantSuggestions(ownerId: string): Promise<string[]> {
  const db = await getDb();
  const [channels, liveFlows] = await Promise.all([
    db.select({ id: bots.id }).from(bots).where(eq(bots.ownerId, ownerId)).limit(1),
    db
      .select({ id: flows.id })
      .from(flows)
      .innerJoin(bots, eq(bots.id, flows.botId))
      .where(and(eq(bots.ownerId, ownerId), eq(flows.isActive, true)))
      .limit(1),
  ]);
  if (channels.length === 0) {
    return ["Walk me through getting set up", "How do I connect Instagram?", "What can Recatch do for my business?"];
  }
  if (liveFlows.length === 0) {
    return ["Build my first comment-to-DM funnel", "What should I set up next?", "Show me the funnel templates"];
  }
  return ["How are my channels doing this week?", "Build a funnel for my next post", "Draft a follow-up for my new leads"];
}
