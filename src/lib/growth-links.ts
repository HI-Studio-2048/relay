import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots, growthLinkEvents, growthLinks } from "@/lib/db/schema";
import {
  growthRedirectPath,
  linksForFlow,
  qrImageUrl,
  telegramStartUrl,
} from "@/lib/growth";

export {
  SLUG_PATTERN,
  applyGrowthAttribution,
  assertSlug,
  attributedContact,
  growthRedirectPath,
  linksForFlow,
  parseStartPayload,
  preferLinkedFlow,
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

export async function listGrowthLinks(botId: string) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  const rows = await db
    .select()
    .from(growthLinks)
    .where(eq(growthLinks.botId, botId))
    .orderBy(desc(growthLinks.createdAt));

  const publicOrigin = process.env.PUBLIC_URL?.replace(/\/$/, "") ?? "";
  return rows.map((row) => {
    const telegramUrl = telegramStartUrl(bot?.telegramUsername, row.slug);
    const redirectPath = growthRedirectPath(row.slug);
    const shortUrl = publicOrigin ? `${publicOrigin}${redirectPath}` : redirectPath;
    return {
      ...row,
      telegramUrl,
      shortUrl,
      qrUrl: qrImageUrl(shortUrl),
    };
  });
}

export async function listGrowthLinksForFlow(botId: string, flowId: string) {
  return linksForFlow(await listGrowthLinks(botId), flowId);
}
