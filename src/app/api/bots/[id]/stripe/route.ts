import { requireBotAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { encryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { readStripe } from "@/lib/stripe";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const stripe = readStripe(bot.settings);
    return json({ connected: Boolean(stripe.webhookSecretEncrypted), goalName: stripe.goalName, tag: stripe.tag });
  } catch (error) {
    return fail(error);
  }
}

/** PUT { webhookSecret?, goalName?, tag? } — the secret (whsec_…) is stored encrypted and never returned. */
export async function PUT(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const body = await readJson<{ webhookSecret?: string; goalName?: string; tag?: string; disconnect?: boolean }>(request);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const current = readStripe(bot.settings);
    const secret = body.webhookSecret?.trim();
    if (secret && !secret.startsWith("whsec_")) return json({ error: "Paste the signing secret that starts with whsec_" }, 400);
    const stripe = {
      webhookSecretEncrypted: body.disconnect ? null : secret ? encryptSecret(secret) : current.webhookSecretEncrypted,
      goalName: body.goalName?.trim() || current.goalName,
      tag: body.tag !== undefined ? body.tag.trim() : current.tag,
    };
    await db.update(bots).set({ settings: { ...(bot.settings ?? {}), stripe }, updatedAt: new Date() }).where(eq(bots.id, id));
    return json({ connected: Boolean(stripe.webhookSecretEncrypted), goalName: stripe.goalName, tag: stripe.tag });
  } catch (error) {
    return fail(error);
  }
}
