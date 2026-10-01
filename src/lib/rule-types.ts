import type { ContactRecord } from "@/lib/types";

/**
 * Browser-safe rule vocabulary and pure matching helpers.
 * Keep database and Telegram imports out of this file — the rules form imports it.
 */

export const RULE_TRIGGERS = [
  { value: "tag_applied", label: "Tag applied", valueLabel: "Tag name" },
  { value: "tag_removed", label: "Tag removed", valueLabel: "Tag name" },
  { value: "subscribed", label: "Subscribed to list", valueLabel: "List name" },
  { value: "unsubscribed", label: "Unsubscribed from list", valueLabel: "List name" },
  { value: "field_set", label: "Custom field set", valueLabel: "Field key" },
  { value: "contact_created", label: "New contact", valueLabel: "—" },
  { value: "goal_reached", label: "Goal reached", valueLabel: "Goal name (empty = any)" },
] as const;

export const RULE_ACTIONS = [
  { value: "subscribe_sequence", label: "Subscribe to sequence", valueLabel: "Sequence name" },
  { value: "unsubscribe_sequence", label: "Unsubscribe from sequence", valueLabel: "Sequence name" },
  { value: "add_tag", label: "Add tag", valueLabel: "Tag name" },
  { value: "remove_tag", label: "Remove tag", valueLabel: "Tag name" },
  { value: "start_flow", label: "Start flow", valueLabel: "Flow" },
  { value: "notify_admin", label: "Notify admin", valueLabel: "Message" },
  { value: "set_field", label: "Set field", valueLabel: "key=value" },
  { value: "assign_to", label: "Assign conversation", valueLabel: "Teammate name (or 'round robin')" },
] as const;

export type RuleTrigger = (typeof RULE_TRIGGERS)[number]["value"];
export type RuleAction = (typeof RULE_ACTIONS)[number]["value"];

export function isRuleTrigger(value: string): value is RuleTrigger {
  return RULE_TRIGGERS.some((item) => item.value === value);
}

export function isRuleAction(value: string): value is RuleAction {
  return RULE_ACTIONS.some((item) => item.value === value);
}

export type RuleEvent = { type: RuleTrigger; value: string };

const lower = (value: string) => value.trim().toLowerCase();

/** What changed on a contact between two saves, expressed as rule triggers. */
export function contactRuleEvents(previous: ContactRecord | null, next: ContactRecord): RuleEvent[] {
  const events: RuleEvent[] = [];
  const beforeTags = new Set((previous?.tags ?? []).map(lower));
  const afterTags = new Set(next.tags.map(lower));
  for (const tag of next.tags) if (!beforeTags.has(lower(tag))) events.push({ type: "tag_applied", value: tag });
  for (const tag of previous?.tags ?? []) if (!afterTags.has(lower(tag))) events.push({ type: "tag_removed", value: tag });

  const beforeLists = new Set((previous?.subscriptions ?? []).map(lower));
  const afterLists = new Set((next.subscriptions ?? []).map(lower));
  for (const list of next.subscriptions ?? []) {
    if (!beforeLists.has(lower(list))) events.push({ type: "subscribed", value: list });
  }
  for (const list of previous?.subscriptions ?? []) {
    if (!afterLists.has(lower(list))) events.push({ type: "unsubscribed", value: list });
  }

  // Email / phone captured or changed count as field_set too ("when email is set → start flow").
  if ((next.email ?? "").trim() && (previous?.email ?? "") !== next.email) events.push({ type: "field_set", value: "email" });
  if ((next.phone ?? "").trim() && (previous?.phone ?? "") !== next.phone) events.push({ type: "field_set", value: "phone" });
  for (const [key, value] of Object.entries(next.customFields)) {
    if (value.trim() && (previous?.customFields[key] ?? "") !== value) events.push({ type: "field_set", value: key });
  }
  return events;
}

export type RuleRow = {
  id: string;
  isActive: boolean;
  triggerType: string;
  triggerValue: string | null;
  actionType: string;
  actionValue: string | null;
};

/** An empty (or "*") trigger value matches any value: "any tag applied", "any goal". */
export function matchingRules<T extends RuleRow>(rules: T[], events: RuleEvent[]): T[] {
  return rules.filter((rule) => {
    if (!rule.isActive) return false;
    const wanted = lower(rule.triggerValue ?? "");
    return events.some((event) => event.type === rule.triggerType && (wanted === "" || wanted === "*" || lower(event.value) === wanted));
  });
}
