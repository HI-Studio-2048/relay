import { eq } from "drizzle-orm";
import { automationPaused } from "@/lib/billing/access";
import { getDb } from "@/lib/db";
import { bots, users } from "@/lib/db/schema";

const TTL_MS = 30_000;
const cache = new Map<string, { paused: boolean; at: number }>();

export class BillingPausedError extends Error {
  constructor() {
    super("This Recatch account is paused until billing is up to date");
  }
}

/**
 * True when the channel account's owner lost their plan (see `automationPaused`). Accounts
 * from before logins have no owner and are never paused. Cached for 30 seconds because every
 * inbound message and every send asks; `forgetBillingPauses` clears it when billing changes.
 */
export async function botBillingPaused(botId: string): Promise<boolean> {
  const hit = cache.get(botId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.paused;
  const db = await getDb();
  const [row] = await db
    .select({ billingStatus: users.billingStatus })
    .from(bots)
    .innerJoin(users, eq(users.id, bots.ownerId))
    .where(eq(bots.id, botId))
    .limit(1);
  const paused = row ? automationPaused(row.billingStatus) : false;
  cache.set(botId, { paused, at: Date.now() });
  return paused;
}

export async function assertBotNotPaused(botId: string) {
  if (await botBillingPaused(botId)) throw new BillingPausedError();
}

export function forgetBillingPauses() {
  cache.clear();
}
