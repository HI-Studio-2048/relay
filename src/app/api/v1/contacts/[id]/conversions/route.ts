import { eq } from "drizzle-orm";
import { lastTouchFlow, recordFlowEvents } from "@/lib/analytics";
import { apiHandler, ownedContactId } from "@/lib/api-v1";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { json, readJson, type RouteParams } from "@/lib/http";

/**
 * POST /api/v1/contacts/:id/conversions { name, value?, flow_id? }
 * Report a purchase / booking from your store or CRM. Credited to flow_id, or to the last flow the
 * contact started in the past 7 days (last touch). Unattributed conversions are still accepted.
 */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  return apiHandler(request, async (botId) => {
    const id = await ownedContactId(botId, (await context.params).id);
    const body = await readJson<{ name?: string; value?: unknown; flow_id?: string }>(request);
    const name = body.name?.trim().slice(0, 80) || "Conversion";
    const value = body.value === undefined || body.value === null ? null : Number(body.value);
    if (value !== null && !Number.isFinite(value)) return json({ error: "value must be a number" }, 400);
    let flowId: string | null = body.flow_id ?? (await lastTouchFlow(id));
    if (flowId) {
      const db = await getDb();
      const [flow] = await db.select({ botId: flows.botId }).from(flows).where(eq(flows.id, flowId)).limit(1);
      if (!flow || flow.botId !== botId) flowId = null;
    }
    if (flowId) await recordFlowEvents([{ botId, flowId, contactId: id, kind: "goal", name, value }]);
    return json({ ok: true, attributed_flow_id: flowId });
  });
}
