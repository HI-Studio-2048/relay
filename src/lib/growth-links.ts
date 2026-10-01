import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots, growthLinkEvents, growthLinks } from "@/lib/db/schema";
import { linksForFlow, nextShareSlug, presentGrowthLink, slugifyName } from "@/lib/growth";
import { publicUrl } from "@/lib/env";

export {
  SLUG_PATTERN,
  applyGrowthAttribution,
  assertSlug,
  attributedContact,
  growthRedirectPath,
  type GrowthLinkView,
  linksForFlow,
  nextShareSlug,
  parseStartPayload,
  preferLinkedFlow,
  presentGrowthLink,
  qrImageUrl,
  slugifyName,
  telegramStartUrl,
} from "@/lib/growth";

function slugEquals(value: string) {
  return sql`lower(${growthLinks.slug}) = ${value.trim().toLowerCase()}`;
}

export async function findGrowthLink(botId: string, slug: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(growthLinks)
    .where(and(eq(growthLinks.botId, botId), slugEquals(slug)))
    .limit(1);
  return row ?? null;
}

export async function findGrowthLinkBySlug(slug: string) {
  const db = await getDb();
  const [row] = await db.select().from(growthLinks).where(slugEquals(slug)).limit(1);
  return row ?? null;
}

export async function recordGrowthClick(linkId: string) {
  const db = await getDb();
  await db.insert(growthLinkEvents).values({
    id: crypto.randomUUID(),
    linkId,
    contactId: null,
    kind: "click",
  });
  await db
    .update(growthLinks)
    .set({ clickCount: sql`${growthLinks.clickCount} + 1` })
    .where(eq(growthLinks.id, linkId));
}

export async function recordGrowthStart(linkId: string, contactId: string) {
  const db = await getDb();
  await db.insert(growthLinkEvents).values({
    id: crypto.randomUUID(),
    linkId,
    contactId,
    kind: "start",
  });
  await db
    .update(growthLinks)
    .set({ startCount: sql`${growthLinks.startCount} + 1` })
    .where(eq(growthLinks.id, linkId));
}

export async function listGrowthLinks(botId: string, options?: { origin?: string | null; flowId?: string | null }) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  const rows = await db
    .select()
    .from(growthLinks)
    .where(
      options?.flowId
        ? and(eq(growthLinks.botId, botId), eq(growthLinks.flowId, options.flowId))
        : eq(growthLinks.botId, botId),
    )
    .orderBy(desc(growthLinks.createdAt));

  const origin = options?.origin ?? process.env.PUBLIC_URL?.replace(/\/$/, "") ?? "";
  return rows.map((row) =>
    presentGrowthLink(row, { telegramUsername: bot?.telegramUsername, channel: bot?.channel, externalAccountId: bot?.externalAccountId, origin, linkedAccounts: linkedOf(bot) }),
  );
}

export async function listGrowthLinksForFlow(
  botId: string,
  flowId: string,
  options?: { origin?: string | null },
) {
  return listGrowthLinks(botId, { origin: options?.origin, flowId });
}

export async function findGrowthLinkByFlowId(botId: string, flowId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(growthLinks)
    .where(and(eq(growthLinks.botId, botId), eq(growthLinks.flowId, flowId)))
    .orderBy(growthLinks.createdAt)
    .limit(1);
  return row ?? null;
}

export async function uniqueShareSlug(botId: string, preferred: string) {
  const db = await getDb();
  const rows = await db
    .select({ slug: growthLinks.slug })
    .from(growthLinks)
    .where(eq(growthLinks.botId, botId));
  return nextShareSlug(
    preferred,
    rows.map((row) => row.slug),
  );
}

export async function ensureFlowShareLink(input: {
  botId: string;
  flowId: string;
  flowName: string;
  preferredSlug?: string | null;
}) {
  const existing = await findGrowthLinkByFlowId(input.botId, input.flowId);
  if (existing) return { link: existing, created: false };

  const preferred = input.preferredSlug?.trim() || slugifyName(input.flowName);
  const slug = await uniqueShareSlug(input.botId, preferred);
  const db = await getDb();
  const [link] = await db
    .insert(growthLinks)
    .values({
      id: crypto.randomUUID(),
      botId: input.botId,
      name: `${input.flowName.trim() || "Flow"} share`,
      slug,
      flowId: input.flowId,
    })
    .returning();
  if (!link) throw new Error("Could not create share link");
  return { link, created: true };
}

export async function presentStoredGrowthLink(
  row: typeof growthLinks.$inferSelect,
  options?: { origin?: string | null },
) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, row.botId)).limit(1);
  const origin = options?.origin ?? process.env.PUBLIC_URL?.replace(/\/$/, "") ?? "";
  return presentGrowthLink(row, { telegramUsername: bot?.telegramUsername, channel: bot?.channel, externalAccountId: bot?.externalAccountId, origin, linkedAccounts: linkedOf(bot) });
}

export function originFromRequest(request: Request): string {
  return publicUrl(request.url) ?? "";
}

function linkedOf(bot: { settings?: Record<string, unknown> | null } | null | undefined) {
  return (bot?.settings?.zernioAccounts as { platform: string; username: string | null }[] | undefined) ?? [];
}
