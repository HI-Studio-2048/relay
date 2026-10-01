import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots, contacts } from "@/lib/db/schema";
import { recordFlowEvents } from "@/lib/analytics";
import { botFieldValues } from "@/lib/template";
import { applyFlowEffects, interpolateTemplate } from "@/lib/flow-effects";
import { executeFrom, type FlowRecord } from "@/lib/flow-engine";
import { outboundPreview } from "@/lib/media";
import { acquireSendSlot } from "@/lib/rate-limit";
import { loadActiveFlows, loadContactRecord, persistContact, persistSession, saveMessage } from "@/lib/store";
import { accountFromRow, channelTarget, sendChannelReply, type ChannelAccount } from "@/lib/channels";
import type { ContactRecord, FlowSessionState, OutboundReply } from "@/lib/types";

/** {{bot.key}} values for an account. */
export async function loadBotFieldValues(botId: string) {
  const db = await getDb();
  const [bot] = await db.select({ settings: bots.settings }).from(bots).where(eq(bots.id, botId)).limit(1);
  return botFieldValues(bot?.settings);
}

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
  source?: "flow" | "agent" | "ai";
}) {
  const botValues = input.replies.length ? await loadBotFieldValues(input.botId) : {};
  for (const reply of input.replies) {
    await acquireSendSlot(input.botId, input.contact.telegramUserId);
    const fill = (value: string) => interpolateTemplate(value, input.contact, botValues);
    const personalized = {
      ...reply,
      text: fill(reply.text),
      ...(reply.cards
        ? { cards: reply.cards.map((card) => ({ ...card, title: fill(card.title), ...(card.subtitle ? { subtitle: fill(card.subtitle) } : {}) })) }
        : {}),
    };
    const sent = await sendChannelReply(input.account, channelTarget(input.contact), personalized);
    await saveMessage({
      botId: input.botId,
      contactId: input.contact.id,
      direction: "outbound",
      source: input.source ?? "flow",
      body: personalized.cards?.length
        ? [personalized.text, `[gallery] ${personalized.cards.map((card) => card.title).join(" · ")}`].filter(Boolean).join("\n")
        : outboundPreview(personalized.text, reply.media),
      telegramMessageId: sent.message_id || null,
    });
    if (reply.flowId) {
      await recordFlowEvents([
        { botId: input.botId, flowId: reply.flowId, stepId: reply.stepId, contactId: input.contact.id, kind: "sent" },
      ]);
    }
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
  await recordFlowEvents([
    { botId: row.botId, flowId: flow.id, contactId: contact.id, kind: "start" },
    ...(executed.completedFlowIds ?? []).map((id) => ({ botId: row.botId, flowId: id, contactId: contact.id, kind: "complete" as const })),
  ]);

  await persistContact(row.botId, executed.contact);
  await persistSession(contact.id, executed.session?.status === "completed" ? null : executed.session);

  const account = accountFromRow(bot);
  await deliverReplies({ botId: row.botId, account, contact: executed.contact, replies: executed.replies });
  await applyFlowEffects({ botId: row.botId, account, contact: executed.contact, effects: executed.effects });

  return { replies: executed.replies.length, session: executed.session };
}
