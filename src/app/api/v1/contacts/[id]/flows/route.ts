import { apiHandler, ownedContactId } from "@/lib/api-v1";
import { FlowDispatchError, startFlowForContact } from "@/lib/flow-dispatch";
import { json, readJson, type RouteParams } from "@/lib/http";

/** POST /api/v1/contacts/:id/flows { flow_id } — ManyChat "sendFlow". */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  return apiHandler(request, async (botId) => {
    const id = await ownedContactId(botId, (await context.params).id);
    const body = await readJson<{ flow_id?: string }>(request);
    if (!body.flow_id) return json({ error: "flow_id is required" }, 400);
    try {
      const result = await startFlowForContact({ contactId: id, flowId: body.flow_id });
      return json({ ok: true, messages_sent: result.replies });
    } catch (error) {
      if (error instanceof FlowDispatchError) return json({ error: error.message }, 404);
      throw error;
    }
  });
}
