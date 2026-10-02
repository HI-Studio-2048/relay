import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { FlowImportError, parseFlowImport } from "@/lib/flow-import";
import { json, fail, readJson } from "@/lib/http";

/** POST { botId, flow } — create an inactive flow from an exported Relay flow file. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; flow?: unknown }>(request);
    if (!body.botId) return json({ error: "botId is required" }, 400);
    const { flow, warnings } = parseFlowImport(body.flow);
    const db = await getDb();
    const [row] = await db
      .insert(flows)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        name: flow.name,
        triggerType: flow.triggerType,
        triggerValue: flow.triggerValue,
        isActive: false,
        priority: 0,
        definition: flow.definition,
      })
      .returning();
    return json({ flow: row, warnings });
  } catch (error) {
    if (error instanceof FlowImportError) return json({ error: error.message }, 400);
    return fail(error);
  }
}
