import { eq } from "drizzle-orm";
import { requireBotAccess } from "@/lib/auth";
import { AiKeyError, aiKeyStatus, verifyAiKey, withAiKey, withAiKeyModel, withoutAiKey } from "@/lib/ai-provider";
import { isAiVendor, pickModel, vendorInfo, type AiVendor } from "@/lib/ai-vendors";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

async function loadBot(id: string) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return { db, bot };
}

function providerName(vendor: AiVendor) {
  return vendorInfo(vendor).label.replace(/ \(.*\)$/, "");
}

/** Why `model` cannot be used with this provider, or null. An empty model means the provider's default. */
function modelProblem(vendor: AiVendor, model: string) {
  if (!model || pickModel(vendor, model) === model) return null;
  return vendorInfo(vendor).anyModel ? "That model id does not look right" : `Pick one of the ${providerName(vendor)} models in the list`;
}

/** The account's own AI key never leaves the server: this only reports whether one is saved, and for which provider. */
export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const { bot } = await loadBot(id);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json(aiKeyStatus(bot.settings));
  } catch (error) {
    return fail(error);
  }
}

/**
 * PUT { provider, apiKey?, model? }. A new key is checked with its provider first. Without apiKey it
 * only changes the model of the key already saved for that provider.
 */
export async function PUT(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const body = await readJson<{ provider?: unknown; apiKey?: unknown; model?: unknown }>(request);
    if (!isAiVendor(body.provider)) return json({ error: "Pick an AI provider" }, 400);
    const provider = body.provider;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const problem = modelProblem(provider, model);
    if (problem) return json({ error: problem }, 400);
    const { db, bot } = await loadBot(id);
    if (!bot) return json({ error: "Account not found" }, 404);
    let settings: Record<string, unknown>;
    if (apiKey) {
      if (apiKey.length > 300 || /\s/.test(apiKey)) return json({ error: `That ${providerName(provider)} key does not look right` }, 400);
      try {
        await verifyAiKey(provider, apiKey);
      } catch (error) {
        if (error instanceof AiKeyError) return json({ error: error.message }, 400);
        throw error;
      }
      settings = withAiKey(bot.settings, { provider, apiKey, model });
    } else {
      const saved = aiKeyStatus(bot.settings);
      if (!saved.connected) return json({ error: `Paste your ${providerName(provider)} key first` }, 400);
      if (saved.provider !== provider) return json({ error: `To switch to ${providerName(provider)}, paste your ${providerName(provider)} key` }, 400);
      settings = withAiKeyModel(bot.settings, model);
    }
    await db.update(bots).set({ settings, updatedAt: new Date() }).where(eq(bots.id, id));
    return json(aiKeyStatus(settings));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const { db, bot } = await loadBot(id);
    if (!bot) return json({ error: "Account not found" }, 404);
    const settings = withoutAiKey(bot.settings);
    await db.update(bots).set({ settings, updatedAt: new Date() }).where(eq(bots.id, id));
    return json(aiKeyStatus(settings));
  } catch (error) {
    return fail(error);
  }
}
