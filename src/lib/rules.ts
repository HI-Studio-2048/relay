import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationRules } from "@/lib/db/schema";
import { interpolateTemplate, notifyAdmin } from "@/lib/flow-effects";
import { emitWebhookSoon, publicContact, type WebhookEvent } from "@/lib/developer";
import { log } from "@/lib/logger";
import { findSequenceByName, subscribeToSequence, unsubscribeFromSequence } from "@/lib/sequences";
import {
  contactRuleEvents,
  matchingRules,
  type RuleEvent,
} from "@/lib/rule-types";
import type { ContactRecord } from "@/lib/types";

export * from "@/lib/rule-types";

const lower = (value: string) => value.trim().toLowerCase();

export async function listRules(botId: string) {
  const db = await getDb();
  return db.select().from(automationRules).where(eq(automationRules.botId, botId));
}

/**
 * Run global rules for a contact change. Tag and field actions re-save the contact with rules
 * disabled, so one rule can chain into a change without looping.
 */
export async function fireContactRules(
  botId: string,
  previous: ContactRecord | null,
  next: ContactRecord,
  options: { created?: boolean } = {},
) {
  const events = contactRuleEvents(previous, next);
  if (options.created) events.unshift({ type: "contact_created", value: "" });
  if (events.length === 0) return;
  const hooks: Record<string, WebhookEvent> = {
    tag_applied: "contact.tag_added",
    tag_removed: "contact.tag_removed",
    field_set: "contact.field_set",
    subscribed: "contact.subscribed",
  };
  for (const event of events) {
    if (event.type === "field_set" && event.value.startsWith("_")) continue;
    const hook = hooks[event.type];
    if (hook) emitWebhookSoon(botId, hook, { contact: publicContact(next), value: event.value });
  }
  await runRules(botId, next, events);
}

/** Run every active rule matching these events for one contact. */
export async function runRules(botId: string, start: ContactRecord, events: RuleEvent[]) {
  if (events.length === 0) return;
  const db = await getDb();
  const rows = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.botId, botId), eq(automationRules.isActive, true)));
  const matched = matchingRules(rows, events);
  if (matched.length === 0) return;

  let contact = start;
  let changed = false;
  for (const rule of matched) {
    const value = (rule.actionValue ?? "").trim();
    if (!value) continue;
    try {
      if (rule.actionType === "subscribe_sequence" || rule.actionType === "unsubscribe_sequence") {
        const sequence = await findSequenceByName(botId, value);
        if (!sequence) continue;
        if (rule.actionType === "subscribe_sequence") await subscribeToSequence(sequence.id, contact.id);
        else await unsubscribeFromSequence(sequence.id, contact.id);
        continue;
      }
      if (rule.actionType === "add_tag") {
        if (!contact.tags.some((tag) => lower(tag) === lower(value))) {
          contact = { ...contact, tags: [...contact.tags, value] };
          changed = true;
        }
        continue;
      }
      if (rule.actionType === "remove_tag") {
        if (contact.tags.some((tag) => lower(tag) === lower(value))) {
          contact = { ...contact, tags: contact.tags.filter((tag) => lower(tag) !== lower(value)) };
          changed = true;
        }
        continue;
      }
      if (rule.actionType === "set_field") {
        const [rawKey, ...rest] = value.split("=");
        const key = (rawKey ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
        if (key && !key.startsWith("_")) {
          contact = { ...contact, customFields: { ...contact.customFields, [key]: interpolateTemplate(rest.join("=").trim(), contact) } };
          changed = true;
        }
        continue;
      }
      if (rule.actionType === "assign_to") {
        const { assignContact, listTeam, pickAssignee } = await import("@/lib/team");
        const member =
          lower(value) === "round robin"
            ? await pickAssignee(botId)
            : (await listTeam()).find((item) => lower(item.name) === lower(value) || lower(item.email ?? "") === lower(value));
        if (member) await assignContact(contact.id, member.id);
        continue;
      }
      if (rule.actionType === "notify_admin") {
        await notifyAdmin(interpolateTemplate(value, contact));
        continue;
      }
      if (rule.actionType === "start_flow") {
        // Lazy import: flow-dispatch depends on the store, which calls back into rules.
        const { startFlowForContact } = await import("@/lib/flow-dispatch");
        await startFlowForContact({ contactId: contact.id, flowId: value });
      }
    } catch (error) {
      log.warn(`Rule "${rule.id}" failed`, error instanceof Error ? error.message : error);
    }
  }
  if (changed) {
    const { persistContact } = await import("@/lib/store");
    await persistContact(botId, contact, { skipRules: true });
  }
}
