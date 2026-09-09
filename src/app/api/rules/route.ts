import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationRules } from "@/lib/db/schema";
import { fail, json, readJson } from "@/lib/http";
import { isRuleAction, isRuleTrigger, listRules } from "@/lib/rules";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    return json({ rules: await listRules(botId) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      botId?: string;
      name?: string;
      triggerType?: string;
      triggerValue?: string;
      actionType?: string;
      actionValue?: string;
    }>(request);
    if (!body.botId || !body.name?.trim() || !body.triggerValue?.trim() || !body.actionValue?.trim()) {
      return json({ error: "botId, name, trigger value, and action value are required" }, 400);
    }
    const triggerType = body.triggerType ?? "tag_applied";
    const actionType = body.actionType ?? "subscribe_sequence";
    if (!isRuleTrigger(triggerType)) return json({ error: `Unknown trigger "${triggerType}"` }, 400);
    if (!isRuleAction(actionType)) return json({ error: `Unknown action "${actionType}"` }, 400);
    const db = await getDb();
    const [rule] = await db
      .insert(automationRules)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        name: body.name.trim(),
        isActive: true,
        triggerType,
        triggerValue: body.triggerValue.trim(),
        actionType,
        actionValue: body.actionValue.trim(),
      })
      .returning();
    return json({ rule });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await readJson<{ id?: string; botId?: string; confirm?: boolean }>(request);
    if (!body.id || !body.botId || body.confirm !== true) {
      return json({ error: "id, botId, and confirm: true are required" }, 400);
    }
    const db = await getDb();
    await db
      .delete(automationRules)
      .where(and(eq(automationRules.id, body.id), eq(automationRules.botId, body.botId)));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
