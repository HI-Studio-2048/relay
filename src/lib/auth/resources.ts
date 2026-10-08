import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  automationRules,
  bots,
  broadcasts,
  contacts,
  customFields,
  flows,
  growthLinks,
  sequences,
  tags,
} from "@/lib/db/schema";
import { AccessError, currentUserId, requireBotAccess } from "@/lib/auth";

const tables = {
  contact: contacts,
  flow: flows,
  broadcast: broadcasts,
  tag: tags,
  field: customFields,
  growthLink: growthLinks,
  sequence: sequences,
  rule: automationRules,
} as const;

export type ResourceKind = keyof typeof tables;

/** The bot a bot-scoped row belongs to, or null when the row doesn't exist. */
export async function resourceBotId(kind: ResourceKind, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const table = tables[kind];
  const db = await getDb();
  const [row] = await db.select({ botId: table.botId }).from(table).where(eq(table.id, id)).limit(1);
  return row?.botId ?? null;
}

/** Throws AccessError unless the row exists and the signed-in user owns its bot. Returns the row's botId. */
export async function requireRowAccess(kind: ResourceKind, id: string | null | undefined): Promise<string> {
  const botId = await resourceBotId(kind, id);
  if (!botId) throw new AccessError("Not found", 404);
  await requireBotAccess(botId);
  return botId;
}

/** Throws AccessError unless the row exists and belongs to this bot (caller has already authorized the bot). */
export async function requireRowInBot(kind: ResourceKind, id: string, botId: string): Promise<void> {
  if ((await resourceBotId(kind, id)) !== botId) throw new AccessError("Not found", 404);
}

/** For server pages: true when the signed-in user owns this bot. Never throws AccessError. */
export async function ownsBot(botId: string | null | undefined): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId || !botId) return false;
  const db = await getDb();
  const [row] = await db.select({ ownerId: bots.ownerId }).from(bots).where(eq(bots.id, botId)).limit(1);
  return row?.ownerId === userId;
}

/** For server pages: true when the row exists and the signed-in user owns its bot. */
export async function ownsRow(kind: ResourceKind, id: string | null | undefined): Promise<boolean> {
  return ownsBot(await resourceBotId(kind, id));
}
