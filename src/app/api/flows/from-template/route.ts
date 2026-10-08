import { requireBotAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { findTemplate } from "@/lib/flow-templates";
import { json, fail, readJson } from "@/lib/http";

/** Install a template as a new, inactive flow. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; templateId?: string }>(request);
    const template = body.templateId ? findTemplate(body.templateId) : null;
    if (!body.botId || !template) return json({ error: "botId and a valid templateId are required" }, 400);
    await requireBotAccess(body.botId);
    const db = await getDb();
    const [flow] = await db
      .insert(flows)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        name: template.name,
        triggerType: template.triggerType,
        triggerValue: template.triggerValue,
        isActive: false,
        priority: 0,
        definition: structuredClone(template.definition),
      })
      .returning();
    return json({ flow });
  } catch (error) {
    return fail(error);
  }
}
