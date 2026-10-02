import { aiConfigured, classifyAutoTags } from "@/lib/ai";
import { log } from "@/lib/logger";
import { addContactTag } from "@/lib/store";

/** AI auto-tags: tags Claude applies when someone's message fits the description (e.g. "asks about wholesale"). */
export type AutoTag = { tag: string; description: string };

export function readAutoTags(settings: Record<string, unknown> | null | undefined): AutoTag[] {
  const raw = settings?.autoTags;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      tag: typeof item?.tag === "string" ? item.tag.trim().slice(0, 40) : "",
      description: typeof item?.description === "string" ? item.description.trim().slice(0, 200) : "",
    }))
    .filter((item) => item.tag && item.description)
    .slice(0, 20);
}

/** Only real messages, and only while some described tag is still missing from the contact. */
export function autoTagCandidates(rules: AutoTag[], contactTags: string[], text: string | null | undefined) {
  const clean = (text ?? "").trim();
  if (clean.length < 3 || clean.startsWith("/")) return [];
  const have = new Set(contactTags.map((tag) => tag.toLowerCase()));
  return rules.filter((rule) => !have.has(rule.tag.toLowerCase()));
}

/** Spend guard (per server process): one check per contact per 10 minutes, at most 2,000 per account a day. */
const CONTACT_COOLDOWN_MS = 10 * 60_000;
const DAILY_CAP = 2000;
const lastChecked = new Map<string, number>();
const daily = new Map<string, { day: string; count: number }>();

export function allowAutoTagCheck(botId: string, contactId: string, now = Date.now()) {
  const last = lastChecked.get(contactId);
  if (last !== undefined && now - last < CONTACT_COOLDOWN_MS) return false;
  const day = new Date(now).toISOString().slice(0, 10);
  const used = daily.get(botId);
  const count = used?.day === day ? used.count : 0;
  if (count >= DAILY_CAP) return false;
  daily.set(botId, { day, count: count + 1 });
  lastChecked.set(contactId, now);
  if (lastChecked.size > 50_000) lastChecked.clear();
  return true;
}

/** Background: tag the contact from their message. Never throws; tags fire rules, sequences and webhooks. */
export async function applyAutoTags(input: { botId: string; brandName: string; settings: Record<string, unknown> | null; contactId: string; contactTags: string[]; text: string | null | undefined }) {
  try {
    if (!aiConfigured()) return;
    const candidates = autoTagCandidates(readAutoTags(input.settings), input.contactTags, input.text);
    if (candidates.length === 0 || !allowAutoTagCheck(input.botId, input.contactId)) return;
    const matched = await classifyAutoTags(input.text!.trim(), candidates, input.brandName);
    for (const tag of matched) await addContactTag(input.botId, input.contactId, tag);
  } catch (error) {
    log.warn("Auto-tagging failed", error instanceof Error ? error.message : error);
  }
}
