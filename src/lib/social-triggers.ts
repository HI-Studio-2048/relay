import { parseKeywordList } from "@/lib/keywords";
import type { ContactRecord, FlowDefinition, TriggerType } from "@/lib/types";

/**
 * ManyChat's Instagram/Facebook growth tools: Comment automation, Story reply and Story mention.
 * Pure helpers, safe to import in the browser.
 */
export const SOCIAL_TRIGGER_TYPES = ["comment", "story_reply", "story_mention"] as const;
export type SocialTriggerType = (typeof SOCIAL_TRIGGER_TYPES)[number];

export function isSocialTrigger(type: string): type is SocialTriggerType {
  return (SOCIAL_TRIGGER_TYPES as readonly string[]).includes(type);
}

/** Stored on FlowDefinition.trigger for comment / story flows. */
export type SocialTriggerConfig = {
  /** Only these posts (Zernio or platform post ids, or permalinks). Empty = every post. */
  postIds?: string[];
  /** Public replies under the comment; one is picked at random so replies do not look botted. */
  publicReplies?: string[];
  /** Skip comments that are replies to other comments. */
  excludeReplies?: boolean;
  /** Fire once per person per post (ManyChat default). */
  oncePerContact?: boolean;
};

export type SocialEvent = {
  kind: SocialTriggerType;
  text: string;
  postId?: string | null;
  platformPostId?: string | null;
  permalink?: string | null;
  isReply?: boolean;
};

export type SocialFlow = {
  id: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  isActive: boolean;
  priority?: number;
  definition: FlowDefinition;
};

function postMatches(config: SocialTriggerConfig | undefined, event: SocialEvent) {
  const wanted = (config?.postIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (wanted.length === 0) return true;
  const ids = [event.postId, event.platformPostId].filter(Boolean) as string[];
  return wanted.some(
    (want) => ids.includes(want) || Boolean(event.permalink && want.startsWith("http") && event.permalink.startsWith(want.replace(/\/+$/, ""))),
  );
}

/** Keywords on a social trigger: empty means "any comment", otherwise any listed word appears. */
export function socialKeywordsMatch(triggerValue: string | null, text: string) {
  const keywords = parseKeywordList(triggerValue);
  if (keywords.length === 0) return true;
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

/** Pick the flow for a comment or story event. Post-specific flows beat "any post" flows. */
export function matchSocialFlow<T extends SocialFlow>(flows: T[], event: SocialEvent): T | null {
  const candidates = flows
    .filter((flow) => flow.isActive && flow.triggerType === event.kind)
    .filter((flow) => !(event.kind === "comment" && event.isReply && flow.definition.trigger?.excludeReplies))
    .filter((flow) => postMatches(flow.definition.trigger, event))
    .filter((flow) => socialKeywordsMatch(flow.triggerValue, event.text));
  const specificity = (flow: T) =>
    (flow.definition.trigger?.postIds?.length ? 2 : 0) + (parseKeywordList(flow.triggerValue).length ? 1 : 0);
  return (
    candidates.slice().sort((a, b) => specificity(b) - specificity(a) || (a.priority ?? 0) - (b.priority ?? 0))[0] ?? null
  );
}

export function commentOnceKey(flowId: string, postId: string | null | undefined) {
  return `_cm:${flowId}:${postId ?? "any"}`;
}

export function alreadyAnswered(contact: ContactRecord | null, flowId: string, postId: string | null | undefined) {
  return Boolean(contact?.customFields[commentOnceKey(flowId, postId)]);
}

export function pickPublicReply(config: SocialTriggerConfig | undefined, random = Math.random()): string | null {
  const options = (config?.publicReplies ?? []).map((reply) => reply.trim()).filter(Boolean);
  if (options.length === 0) return null;
  return options[Math.min(options.length - 1, Math.floor(random * options.length))]!;
}
