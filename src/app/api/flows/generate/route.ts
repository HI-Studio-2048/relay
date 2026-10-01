import { eq } from "drizzle-orm";
import { AiUnavailableError, generateFlowDraft, readAiSettings } from "@/lib/ai";
import { generatedToDefinition } from "@/lib/ai-flow";
import { getDb } from "@/lib/db";
import { bots, flows } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";

/** "Describe your automation" → a new, inactive flow ready to review on the canvas. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; prompt?: string }>(request);
    const prompt = body.prompt?.trim();
    if (!body.botId || !prompt) return json({ error: "botId and prompt are required" }, 400);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, body.botId)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const draft = await generateFlowDraft(prompt.slice(0, 4000), readAiSettings(bot.settings), bot.name);
    const built = generatedToDefinition(draft);
    const [flow] = await db
      .insert(flows)
      .values({
        id: crypto.randomUUID(),
        botId: bot.id,
        name: built.name,
        triggerType: built.triggerType,
        triggerValue: built.triggerValue,
        isActive: false,
        priority: 0,
        definition: built.definition,
      })
      .returning();
    return json({ flow });
  } catch (error) {
    if (error instanceof AiUnavailableError) return json({ error: error.message }, 503);
    return fail(error);
  }
}
