import type { FlowRecord } from "@/lib/flow-engine";
import type { ContactRecord } from "@/lib/types";

export const SLUG_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

export function parseStartPayload(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("/start")) return null;
  const withoutMention = trimmed.replace(/^\/start@[^\s]+/i, "/start");
  const parts = withoutMention.split(/\s+/);
  const payload = parts.slice(1).join(" ").trim();
  return payload.length > 0 ? payload : null;
}

export function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return slug || "link";
}

export function assertSlug(slug: string): string {
  const next = slug.trim();
  if (!SLUG_PATTERN.test(next)) {
    throw new Error("Start param must be 1–64 letters, numbers, or underscores (Telegram rule).");
  }
  return next;
}

export function telegramStartUrl(username: string | null | undefined, slug: string): string | null {
  if (!username) return null;
  const handle = username.replace(/^@/, "");
  return `https://t.me/${handle}?start=${encodeURIComponent(slug)}`;
}

export function growthRedirectPath(slug: string): string {
  return `/go/${encodeURIComponent(slug)}`;
}

export function linksForFlow<T extends { flowId: string | null }>(links: T[], flowId: string) {
  return links.filter((link) => link.flowId === flowId);
}

export type GrowthLinkView = {
  id: string;
  name: string;
  slug: string;
  tagName: string | null;
  flowId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  clickCount: number;
  startCount: number;
  telegramUrl: string | null;
  shortUrl: string;
  qrUrl: string;
  flowName?: string | null;
};

export function qrImageUrl(target: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(target)}`;
}

export function preferLinkedFlow(
  flows: FlowRecord[],
  flowId: string | null | undefined,
  slug?: string | null,
): FlowRecord[] {
  if (!flowId) return flows;
  const preferred = flows.find((flow) => flow.id === flowId && flow.isActive);
  if (!preferred) return flows;
  const next: FlowRecord = slug
    ? { ...preferred, triggerType: "start_param", triggerValue: slug }
    : { ...preferred, triggerType: "start" };
  return [next, ...flows.filter((flow) => flow.id !== flowId)];
}

export function attributedContact(
  existing: ContactRecord | null,
  identity: {
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  },
  link: { tagName: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null },
): ContactRecord {
  const base: ContactRecord = existing ?? {
    id: crypto.randomUUID(),
    telegramUserId: identity.telegramUserId,
    username: identity.username,
    firstName: identity.firstName,
    lastName: identity.lastName,
    email: null,
    phone: null,
    customFields: {},
    tags: [],
  };
  return applyGrowthAttribution(base, link);
}

export function applyGrowthAttribution(
  contact: ContactRecord,
  link: { tagName: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null },
): ContactRecord {
  const tags = link.tagName && !contact.tags.includes(link.tagName) ? [...contact.tags, link.tagName] : contact.tags;
  const customFields = { ...contact.customFields };
  if (link.utmSource) customFields.utm_source = link.utmSource;
  if (link.utmMedium) customFields.utm_medium = link.utmMedium;
  if (link.utmCampaign) customFields.utm_campaign = link.utmCampaign;
  return { ...contact, tags, customFields };
}
