import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { accountFromRow, channelTarget, sendChannelReply } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { bots, contacts, messages, scheduledMessages } from "@/lib/db/schema";
import { interpolateTemplate } from "@/lib/flow-effects";
import { log } from "@/lib/logger";
import { messagingWindow } from "@/lib/messaging-window";
import { acquireSendSlot } from "@/lib/rate-limit";
import { loadContactRecord, pauseContactAutomation, saveMessage } from "@/lib/store";
import { assignContact } from "@/lib/team";
import { botFieldValues } from "@/lib/template";

export class AgentReplyError extends Error {}

/**
 * Send a teammate's Live Chat reply: fills in {{variables}}, uses the HUMAN_AGENT tag after the 24h
 * window on direct Meta accounts, logs it with the author, assigns an unassigned chat to them, and
 * pauses the bot for that person. Shared by "Send" and scheduled replies.
 */
export async function sendAgentReply(input: { contactId: string; text: string; agent: { id: string; name: string } | null }) {
  const db = await getDb();
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1);
  if (!contact) throw new AgentReplyError("Contact not found");
  const [bot] = await db.select().from(bots).where(eq(bots.id, contact.botId)).limit(1);
  if (!bot) throw new AgentReplyError("Bot not found");
  await acquireSendSlot(contact.botId, contact.telegramUserId);
  const [lastInbound] = await db
    .select({ at: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.contactId, input.contactId), eq(messages.direction, "inbound")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const window = messagingWindow(contact.platform, bot.channel, lastInbound?.at ?? null);
  // Saved replies can carry {{first_name}}, {{field:x}} and {{bot.key}}: fill them in for this person.
  const record = await loadContactRecord(input.contactId);
  const raw = input.text.trim();
  const text = raw.includes("{{") && record ? interpolateTemplate(raw, record, botFieldValues(bot.settings)) : raw;
  const sent = await sendChannelReply(accountFromRow(bot), channelTarget(contact), {
    text,
    source: "agent",
    // Direct Meta accounts: after 24 hours a human reply must carry the HUMAN_AGENT tag.
    ...(window.kind === "human_agent" ? { humanAgent: true } : {}),
  });
  // The message is out: bookkeeping below must never make it look unsent.
  try {
    await saveMessage({
      botId: contact.botId,
      contactId: input.contactId,
      direction: "outbound",
      source: "agent",
      body: text,
      telegramMessageId: sent.message_id || null,
      author: input.agent?.name ?? null,
    });
    // Whoever answers an unassigned conversation picks it up.
    if (input.agent?.id && !contact.assignedTo) await assignContact(input.contactId, input.agent.id);
    await pauseContactAutomation(input.contactId);
  } catch (error) {
    log.warn("Reply sent, but logging it failed", error instanceof Error ? error.message : error);
  }
  return sent;
}

/** Pending replies, plus failed ones until a teammate dismisses them. */
export async function listScheduled(contactId: string) {
  const db = await getDb();
  return db
    .select()
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.contactId, contactId), inArray(scheduledMessages.status, ["pending", "failed"])))
    .orderBy(asc(scheduledMessages.sendAt));
}

let lastCheck = 0;

/** Worker tick: send scheduled replies that are due. Each row is claimed first so it goes out once. */
export async function sendDueScheduled() {
  if (Date.now() - lastCheck < 15_000) return;
  lastCheck = Date.now();
  const db = await getDb();
  // A crash between claiming and finishing leaves a row in "sending": surface it as failed (never
  // resend: the message may already have gone out).
  await db
    .update(scheduledMessages)
    .set({ status: "failed", error: "Interrupted while sending — check the conversation before resending" })
    .where(and(eq(scheduledMessages.status, "sending"), lte(scheduledMessages.sendAt, new Date(Date.now() - 10 * 60_000))));
  const due = await db
    .select()
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.status, "pending"), lte(scheduledMessages.sendAt, new Date())))
    .limit(50);
  for (const row of due) {
    const [claimed] = await db
      .update(scheduledMessages)
      .set({ status: "sending" })
      .where(and(eq(scheduledMessages.id, row.id), eq(scheduledMessages.status, "pending")))
      .returning();
    if (!claimed) continue;
    try {
      await sendAgentReply({
        contactId: row.contactId,
        text: row.body,
        agent: row.author ? { id: row.authorId ?? "", name: row.author } : null,
      });
      await db.update(scheduledMessages).set({ status: "sent" }).where(eq(scheduledMessages.id, row.id));
    } catch (error) {
      // Shown on the scheduled item in Live Chat (not as a chat message, which would hide the thread
      // from "Needs reply").
      const message = error instanceof Error ? error.message : "Send failed";
      log.warn("Scheduled reply failed", message);
      await db
        .update(scheduledMessages)
        .set({ status: "failed", error: message.slice(0, 300) })
        .where(eq(scheduledMessages.id, row.id))
        .catch(() => undefined);
    }
  }
}
