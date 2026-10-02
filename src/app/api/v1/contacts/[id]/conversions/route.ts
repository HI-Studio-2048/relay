import { apiHandler, ownedContactId } from "@/lib/api-v1";
import { recordConversion } from "@/lib/conversions";
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
    const { flowId } = await recordConversion({ botId, contactId: id, name, value, flowId: body.flow_id ?? null });
    return json({ ok: true, attributed_flow_id: flowId });
  });
}
