import { eq } from "drizzle-orm";
import { aiConfigured, converse, readAiSettings, type HistoryLine } from "@/lib/ai";
import type { ChannelAccount } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { deliverReplies } from "@/lib/flow-dispatch";
import { applyFlowEffects, notifyAdmin } from "@/lib/flow-effects";
import { executeFrom } from "@/lib/flow-engine";
import { assignFieldValue, parseCaptureField } from "@/lib/lead-capture";
import { emitWebhookSoon, publicContact } from "@/lib/developer";
import { log } from "@/lib/logger";
import { assignContact, pickAssignee } from "@/lib/team";
import {
  listMessages,
  loadActiveFlows,
  loadActiveSession,
  loadContactRecord,
  pauseContactAutomation,
  persistContact,
  persistSession,

} from "@/lib/store";
import type { ContactRecord } from "@/lib/types";

const FALLBACK_HANDOFF = "Thanks! A teammate will pick this up shortly.";

async function loadContext(botId: string, contactId: string) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  const contact = await loadContactRecord(contactId);
  const rows = await listMessages(contactId);
  const history: HistoryLine[] = rows
    .filter((row) => !row.body.startsWith("Admin notify:"))
    .map((row) => ({ direction: row.direction === "outbound" ? "outbound" : "inbound", body: row.body }));
  return { bot, contact, history, settings: readAiSettings(bot?.settings) };
}

function applyCollected(contact: ContactRecord, collected: Record<string, string>) {
  let next = contact;
  for (const [key, value] of Object.entries(collected)) {
    try {
      const field = parseCaptureField(["name", "email", "phone"].includes(key) ? key : `custom:${key}`);
      next = assignFieldValue(next, field, value);
    } catch {
      // A value the validator rejects (bad email) is left for the AI to ask again.
    }
  }
  return next;
}

async function handOff(botId: string, account: ChannelAccount, contact: ContactRecord, reply: string, handoffMessage: string) {
  const text = reply || handoffMessage || FALLBACK_HANDOFF;
  await deliverReplies({ botId, account, contact, replies: [{ text, source: "flow" }], source: "ai" });
  // A hand-off keeps the bot quiet for a day, or until a teammate resumes it in Live Chat.
  await pauseContactAutomation(contact.id, 24 * 60);
  const assignee = await pickAssignee(botId);
  if (assignee) await assignContact(contact.id, assignee.id);
  await persistContact(botId, { ...contact, inboxStatus: "open" }, { skipRules: true });
  emitWebhookSoon(botId, "conversation.handoff", { contact: publicContact(contact), reply: text });
  await notifyAdmin(`AI handed off ${[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.username || "a contact"} to a human.`).catch(() => false);
}

/** AI Step: one Claude turn for a contact parked on an `ai` step. Continues the flow when the goal is met. */
export async function runAiTurn(input: { botId: string; account: ChannelAccount; contactId: string; flowId: string; stepId: string }) {
  if (!aiConfigured()) {
    log.warn("AI step reached but ANTHROPIC_API_KEY is not set; pausing for a human");
    await pauseContactAutomation(input.contactId);
    return;
  }
  const { bot, contact, history, settings } = await loadContext(input.botId, input.contactId);
  if (!bot || !contact) return;
  const flows = await loadActiveFlows(input.botId);
  const flow = flows.find((item) => item.id === input.flowId);
  const step = flow?.definition.steps.find((item) => item.id === input.stepId);
  if (!flow || step?.type !== "ai") return;

  const result = await converse({
    settings,
    brandName: bot.name,
    contact,
    history,
    goal: step.goal,
    collect: step.collect,
  });
  let updated = applyCollected(contact, result.collected);
  if (updated !== contact) await persistContact(input.botId, updated);

  if (result.handoff) {
    await handOff(input.botId, input.account, updated, result.reply, settings.handoffMessage ?? "");
    return;
  }
  if (result.reply) {
    await deliverReplies({ botId: input.botId, account: input.account, contact: updated, replies: [{ text: result.reply, source: "flow" }], source: "ai" });
  }
  if (!result.goalComplete) return;

  const session = await loadActiveSession(updated.id);
  if (!session || session.stepId !== step.id) return;
  if (!step.next) {
    await persistSession(updated.id, null);
    return;
  }
  const executed = executeFrom(flow.definition, { ...session, stepId: step.next, awaitingInput: false }, updated, Date.now(), flows);
  updated = executed.contact;
  await persistContact(input.botId, updated);
  await persistSession(updated.id, executed.session?.status === "completed" ? null : executed.session);
  await deliverReplies({ botId: input.botId, account: input.account, contact: updated, replies: executed.replies });
  await applyFlowEffects({ botId: input.botId, account: input.account, contact: updated, effects: executed.effects });
}

/** AI auto-reply: answer a message no flow or keyword matched, using the account's knowledge. */
export async function runAiAutoReply(input: { botId: string; account: ChannelAccount; contactId: string }) {
  if (!aiConfigured()) return false;
  const { bot, contact, history, settings } = await loadContext(input.botId, input.contactId);
  if (!bot || !contact || !settings.autoReply) return false;
  const result = await converse({ settings, brandName: bot.name, contact, history });
  if (result.handoff) {
    await handOff(input.botId, input.account, contact, result.reply, settings.handoffMessage ?? "");
    return true;
  }
  if (!result.reply) return false;
  await deliverReplies({ botId: input.botId, account: input.account, contact, replies: [{ text: result.reply, source: "flow" }], source: "ai" });
  return true;
}

