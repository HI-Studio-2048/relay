import type { FlowRecord } from "@/lib/flow-engine";
import type { ContactRecord } from "@/lib/types";

export const SLUG_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

/** Presented growth link row used by Growth admin + flow Share chrome. */
export type GrowthLinkView = {
  id: string;
  name: string;
  slug: string;
  tagName: string | null;
  flowId: string | null;
  flowName?: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  clickCount: number;
  startCount: number;
  telegramUrl: string | null;
  /** Zernio accounts: one deep link per DM network. */
  entries?: EntryLink[];
  shortUrl: string;
  qrUrl: string;
  createdAt?: string | Date;
};

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

/**
 * ManyChat-style entry link per channel: t.me ?start=, m.me / ig.me ?ref=, or a wa.me pre-filled text
 * (WhatsApp has no ref parameter; the engine treats a first message equal to a slug as that link).
 */
export function channelStartUrl(
  input: { channel?: string | null; handle?: string | null; externalAccountId?: string | null },
  slug: string,
): string | null {
  const channel = input.channel ?? "telegram";
  const handle = input.handle?.replace(/^@/, "") ?? "";
  if (channel === "telegram") return telegramStartUrl(handle, slug);
  if (channel === "messenger") {
    const target = handle || input.externalAccountId;
    return target ? `https://m.me/${encodeURIComponent(target)}?ref=${encodeURIComponent(slug)}` : null;
  }
  if (channel === "instagram") {
    return handle ? `https://ig.me/m/${encodeURIComponent(handle)}?ref=${encodeURIComponent(slug)}` : null;
  }
  if (channel === "whatsapp") {
    const phone = (handle || "").replace(/[^\d]/g, "");
    return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(slug)}` : null;
  }
  return null;
}

export type EntryLink = { platform: string; label: string; handle: string; url: string };

const ENTRY_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Messenger", whatsapp: "WhatsApp", telegram: "Telegram" };

/**
 * Deep links into each DM network a Zernio workspace reaches, all carrying the growth-link ref.
 * Networks without a public "open a DM with a ref" URL are left out.
 */
export function zernioEntryLinks(accounts: { platform: string; username: string | null }[], slug: string): EntryLink[] {
  const ref = encodeURIComponent(slug);
  const links: EntryLink[] = [];
  for (const account of accounts) {
    const handle = (account.username ?? "").replace(/^@/, "");
    if (!handle) continue;
    let url: string | null = null;
    if (account.platform === "instagram") url = `https://ig.me/m/${encodeURIComponent(handle)}?ref=${ref}`;
    if (account.platform === "facebook") url = `https://m.me/${encodeURIComponent(handle)}?ref=${ref}`;
    if (account.platform === "telegram") url = `https://t.me/${encodeURIComponent(handle)}?start=${ref}`;
    if (account.platform === "whatsapp") {
      const phone = handle.replace(/[^\d]/g, "");
      url = phone ? `https://wa.me/${phone}?text=${ref}` : null;
    }
    if (url) links.push({ platform: account.platform, label: ENTRY_LABEL[account.platform] ?? account.platform, handle, url });
  }
  return links;
}

export function growthRedirectPath(slug: string): string {
  return `/go/${encodeURIComponent(slug)}`;
}

/** Rendered by Recatch itself (/api/qr), so links never go to a third-party QR service. */
export function qrImageUrl(target: string): string {
  return `/api/qr?data=${encodeURIComponent(target)}`;
}

export function linksForFlow<T extends { flowId: string | null }>(links: T[], flowId: string) {
  return links.filter((link) => link.flowId === flowId);
}

/** First unused Telegram start param, preferring `preferred` then `_2`, `_3`, … */
export function nextShareSlug(preferred: string, taken: Iterable<string>): string {
  const existing = new Set([...taken].map((item) => item.toLowerCase()));
  const raw = preferred.trim();
  const base = (SLUG_PATTERN.test(raw) ? raw : slugifyName(raw)).toLowerCase();
  assertSlug(base);
  if (!existing.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `_${n}`;
    const next = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!existing.has(next.toLowerCase())) return assertSlug(next);
  }
  throw new Error("Could not allocate a unique start param");
}

export function presentGrowthLink<T extends { slug: string }>(
  row: T,
  input: {
    telegramUsername?: string | null;
    channel?: string | null;
    externalAccountId?: string | null;
    origin?: string | null;
    linkedAccounts?: { platform: string; username: string | null }[];
  },
) {
  /** Kept under its historical name; it is the channel's deep link (t.me, m.me, ig.me, or wa.me). */
  const entries = input.channel === "zernio" ? zernioEntryLinks(input.linkedAccounts ?? [], row.slug) : [];
  const telegramUrl =
    input.channel === "zernio"
      ? (entries[0]?.url ?? null)
      : channelStartUrl({ channel: input.channel, handle: input.telegramUsername, externalAccountId: input.externalAccountId }, row.slug);
  const redirectPath = growthRedirectPath(row.slug);
  const origin = input.origin?.replace(/\/$/, "") ?? "";
  const shortUrl = origin ? `${origin}${redirectPath}` : redirectPath;
  return {
    ...row,
    telegramUrl,
    entries,
    shortUrl,
    qrUrl: qrImageUrl(shortUrl),
  };
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
