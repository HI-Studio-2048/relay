import { json, fail, type RouteParams } from "@/lib/http";
import { resumeContactAutomation } from "@/lib/store";

/** ManyChat Live Chat "Resume automation" after an agent reply paused the flow. */
export async function POST(_request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const session = await resumeContactAutomation(contactId);
    return json({ ok: true, automation: session?.status ?? "idle" });
  } catch (error) {
    return fail(error, "Could not resume automation");
  }
}
