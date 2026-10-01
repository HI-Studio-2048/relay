
export const KEYWORD_TRIGGER_TYPES = [
  "keyword",
  "keyword_contains",
  "keyword_word",
  "keyword_starts_with",
  "keyword_not_contains",
] as const;

export type KeywordTriggerType = (typeof KEYWORD_TRIGGER_TYPES)[number];

export const KEYWORD_RULE_OPTIONS: { value: KeywordTriggerType; label: string; hint: string }[] = [
  { value: "keyword", label: "Message is", hint: "Exact match, not case-sensitive" },
  { value: "keyword_contains", label: "Message contains", hint: "Keyword anywhere in the text" },
  { value: "keyword_word", label: "Message contains a whole word", hint: "Avoids matching inside other words" },
  { value: "keyword_starts_with", label: "Message begins with", hint: "Must be at the start of the message" },
  { value: "keyword_not_contains", label: "Message doesn't contain", hint: "Fires only if none of the words appear" },
];

export function isKeywordTrigger(type: string): type is KeywordTriggerType {
  return (KEYWORD_TRIGGER_TYPES as readonly string[]).includes(type);
}

/** ManyChat: up to 10 keywords per rule, comma or newline separated. */
export function parseKeywordList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesKeywordRule(
  type: KeywordTriggerType,
  message: string,
  keywords: string[],
): boolean {
  if (keywords.length === 0) return false;
  const text = message.trim().toLowerCase();
  if (!text) return false;
  if (type === "keyword") return keywords.some((keyword) => text === keyword);
  if (type === "keyword_contains") return keywords.some((keyword) => text.includes(keyword));
  if (type === "keyword_starts_with") return keywords.some((keyword) => text.startsWith(keyword));
  if (type === "keyword_not_contains") return keywords.every((keyword) => !text.includes(keyword));
  return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text));
}

export function compareKeywordPriority(
  a: { priority?: number; createdAt?: string | Date | null },
  b: { priority?: number; createdAt?: string | Date | null },
): number {
  const byPriority = (a.priority ?? 0) - (b.priority ?? 0);
  if (byPriority !== 0) return byPriority;
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return aTime - bTime;
}
