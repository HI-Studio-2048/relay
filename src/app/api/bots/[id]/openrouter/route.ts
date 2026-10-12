import { eq } from "drizzle-orm";
import { requireBotAccess } from "@/lib/auth";
import {
  OpenRouterError,
  openRouterStatus,
  verifyOpenRouterKey,
  withOpenRouter,
  withOpenRouterModel,
  withoutOpenRouter,
} from "@/lib/ai-provider";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

async function loadBot(id: string) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return { db, bot };
}

/** The account's OpenRouter key never leaves the server: this only reports whether one is saved. */
export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const { bot } = await loadBot(id);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json(openRouterStatus(bot.settings));
  } catch (error) {
    return fail(error);
  }
}

/** PUT { apiKey?, model? }. A new key is checked with OpenRouter first. Without apiKey it only changes the model. */
export async function PUT(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const body = await readJson<{ apiKey?: unknown; model?: unknown }>(request);
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : "";
    const { db, bot } = await loadBot(id);
    if (!bot) return json({ error: "Account not found" }, 404);
    let settings: Record<string, unknown>;
    if (apiKey) {
      if (apiKey.length > 300 || /\s/.test(apiKey)) return json({ error: "That does not look like an OpenRouter key" }, 400);
      try {
        await verifyOpenRouterKey(apiKey);
      } catch (error) {
        if (error instanceof OpenRouterError) return json({ error: error.message }, 400);
        throw error;
      }
      settings = withOpenRouter(bot.settings, { apiKey, model });
    } else {
      if (!openRouterStatus(bot.settings).connected) return json({ error: "Paste your OpenRouter key first" }, 400);
      settings = withOpenRouterModel(bot.settings, model);
    }
    await db.update(bots).set({ settings, updatedAt: new Date() }).where(eq(bots.id, id));
    return json(openRouterStatus(settings));
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
    const settings = withoutOpenRouter(bot.settings);
    await db.update(bots).set({ settings, updatedAt: new Date() }).where(eq(bots.id, id));
    return json(openRouterStatus(settings));
  } catch (error) {
    return fail(error);
  }
}
