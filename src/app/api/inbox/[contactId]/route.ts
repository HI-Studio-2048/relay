import { json, fail, type RouteParams } from "@/lib/http";
import { listMessages, loadContactRecord } from "@/lib/store";

export async function GET(_request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const contact = await loadContactRecord(contactId);
    if (!contact) return json({ error: "Contact not found" }, 404);
    const messages = await listMessages(contactId);
    return json({ contact, messages });
  } catch (error) {
    return fail(error);
  }
}
