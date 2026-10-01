import { and, desc, eq } from "drizzle-orm";
import { accountFromRow, channelTarget, sendChannelReply } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { bots, contacts, messages } from "@/lib/db/schema";
import { messagingWindow } from "@/lib/messaging-window";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { acquireSendSlot } from "@/lib/rate-limit";
import { pauseContactAutomation, saveMessage } from "@/lib/store";
import { agentIdFromCookieHeader, assignContact, findMember } from "@/lib/team";

export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const body = await readJson<{ text?: string }>(request);
    if (!body.text?.trim()) return json({ error: "Message text is required" }, 400);
    const db = await getDb();
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!contact) return json({ error: "Contact not found" }, 404);
    const [bot] = await db.select().from(bots).where(eq(bots.id, contact.botId)).limit(1);
    if (!bot) return json({ error: "Bot not found" }, 404);
    const agent = await findMember(agentIdFromCookieHeader(request.headers.get("cookie")));
    await acquireSendSlot(contact.botId, contact.telegramUserId);
    const [lastInbound] = await db
      .select({ at: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.contactId, contactId), eq(messages.direction, "inbound")))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    const window = messagingWindow(contact.platform, bot.channel, lastInbound?.at ?? null);
    const sent = await sendChannelReply(accountFromRow(bot), channelTarget(contact), {
      text: body.text.trim(),
      source: "agent",
      // Direct Meta accounts: after 24 hours a human reply must carry the HUMAN_AGENT tag.
      ...(window.kind === "human_agent" ? { humanAgent: true } : {}),
    });
    await saveMessage({
      botId: contact.botId,
      contactId,
      direction: "outbound",
      source: "agent",
      body: body.text.trim(),
      telegramMessageId: sent.message_id || null,
      author: agent?.name ?? null,
    });
    // Whoever answers an unassigned conversation picks it up.
    if (agent && !contact.assignedTo) await assignContact(contactId, agent.id);
    await pauseContactAutomation(contactId);
    return json({ ok: true, telegramMessageId: sent.message_id });
  } catch (error) {
    return fail(error, "Could not send reply");
  }
}
