import { requireRowAccess } from "@/lib/auth/resources";
import { FlowDispatchError, startFlowForContact } from "@/lib/flow-dispatch";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

/** ManyChat Live Chat "Send Flow": run a flow for this contact now. Also usable as an external trigger. */
export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    await requireRowAccess("contact", contactId);
    const body = await readJson<{ flowId?: string }>(request);
    if (!body.flowId) return json({ error: "flowId is required" }, 400);
    const result = await startFlowForContact({ contactId, flowId: body.flowId });
    return json({ ok: true, replies: result.replies, automation: result.session?.status ?? "idle" });
  } catch (error) {
    if (error instanceof FlowDispatchError) return json({ error: error.message }, 404);
    return fail(error, "Could not send flow");
  }
}
