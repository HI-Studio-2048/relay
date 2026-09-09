import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots, contacts } from "@/lib/db/schema";
import { applyFlowEffects, interpolateTemplate } from "@/lib/flow-effects";
import { executeFrom, type FlowRecord } from "@/lib/flow-engine";
import { outboundPreview } from "@/lib/media";
import { acquireSendSlot } from "@/lib/rate-limit";
import { loadActiveFlows, loadContactRecord, persistContact, persistSession, saveMessage } from "@/lib/store";
import { accountFromRow, sendChannelReply, type ChannelAccount } from "@/lib/channels";
import type { ContactRecord, FlowSessionState, OutboundReply } from "@/lib/types";

export class FlowDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowDispatchError";
  }
}

/** Send a batch of engine replies to one contact and log them to the inbox thread. */
export async function deliverReplies(input: {
  botId: string;
  account: ChannelAccount;
  contact: ContactRecord;
  replies: OutboundReply[];
  source?: "flow" | "agent";
}) {
  for (const reply of input.replies) {
    await acquireSendSlot(input.botId, input.contact.telegramUserId);
    const personalized = { ...reply, text: interpolateTemplate(reply.text, input.contact) };
    const sent = await sendChannelReply(input.account, input.contact.telegramUserId, personalized);
    await saveMessage({
      botId: input.botId,
      contactId: input.contact.id,
      direction: "outbound",
      source: input.source ?? "flow",
      body: outboundPreview(personalized.text, reply.media),
      telegramMessageId: sent.message_id || null,
    });
  }
}

/**
 * ManyChat "Send Flow" from Live Chat, and the external trigger API:
 * start a flow for one contact right now, replacing whatever session they were in.
 */
export async function startFlowForContact(input: { contactId: string; flowId: string; now?: number }) {
  const db = await getDb();
  const [row] = await db.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1);
  if (!row) throw new FlowDispatchError("Contact not found");
  const contact = await loadContactRecord(row.id);
  if (!contact) throw new FlowDispatchError("Contact not found");
  const [bot] = await db.select().from(bots).where(eq(bots.id, row.botId)).limit(1);
  if (!bot) throw new FlowDispatchError("Bot not found");

  const flows = await loadActiveFlows(row.botId);
  const flow: FlowRecord | undefined = flows.find((item) => item.id === input.flowId);
  if (!flow) throw new FlowDispatchError("Flow not found");

  const session: FlowSessionState = {
    id: crypto.randomUUID(),
    contactId: contact.id,
    flowId: flow.id,
    stepId: flow.definition.startStepId,
    awaitingInput: false,
    status: "active",
  };
  const executed = executeFrom(flow.definition, session, contact, input.now ?? Date.now(), flows);

  await persistContact(row.botId, executed.contact);
  await persistSession(contact.id, executed.session?.status === "completed" ? null : executed.session);

  const account = accountFromRow(bot);
  await deliverReplies({ botId: row.botId, account, contact: executed.contact, replies: executed.replies });
  await applyFlowEffects({ botId: row.botId, account, contact: executed.contact, effects: executed.effects });

  return { replies: executed.replies.length, session: executed.session };
}
