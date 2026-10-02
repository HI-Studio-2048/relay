import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { othersHere, touchPresence } from "@/lib/presence";
import { agentIdFromCookieHeader } from "@/lib/team";

/** POST { typing } — "I'm here (and typing)"; returns the other teammates on this conversation. */
export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const agentId = agentIdFromCookieHeader(request.headers.get("cookie"));
    const body = await readJson<{ typing?: unknown }>(request).catch(() => ({ typing: false }));
    if (agentId) touchPresence(contactId, agentId, body.typing === true);
    return json({ others: othersHere(contactId, agentId) });
  } catch (error) {
    return fail(error);
  }
}
