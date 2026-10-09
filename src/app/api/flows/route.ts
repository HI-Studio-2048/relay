import { eq } from "drizzle-orm";
import { requireBotAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { EXAMPLE_LEAD_CAPTURE_FLOW } from "@/lib/example-flow";
import { syncBotCommands } from "@/lib/bot-commands";
import { json, fail, readJson } from "@/lib/http";
import type { FlowDefinition } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    const db = await getDb();
    return json({ flows: await db.select().from(flows).where(eq(flows.botId, botId)) });
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
      priority?: number;
      definition?: FlowDefinition;
    }>(request);
    if (!body.botId || !body.name?.trim()) return json({ error: "botId and name are required" }, 400);
    await requireBotAccess(body.botId);
    const db = await getDb();
    const [flow] = await db
      .insert(flows)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        name: body.name.trim(),
        triggerType: body.triggerType ?? "keyword",
        triggerValue: body.triggerValue ?? null,
        isActive: true,
        priority: body.priority ?? 0,
        definition: body.definition ?? {
          startStepId: "start",
          steps: [{ id: "start", type: "end", text: "Thanks — we got your message." }],
        },
      })
      .returning();
    if (flow?.triggerType === "command") await syncBotCommands(body.botId);
    return json({ flow });
  } catch (error) {
    return fail(error);
  }
}

export const exampleFlow = EXAMPLE_LEAD_CAPTURE_FLOW;
