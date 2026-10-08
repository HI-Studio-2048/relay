import { requireBotAccess } from "@/lib/auth";
import { requireRowAccess } from "@/lib/auth/resources";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { othersHere, touchPresence } from "@/lib/presence";
import { agentIdFromCookieHeader, findMember } from "@/lib/team";

/** POST { typing } — "I'm here (and typing)"; returns the other teammates on this conversation. */
export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const userId = await requireBotAccess(await requireRowAccess("contact", contactId));
    const agentId = (await findMember(agentIdFromCookieHeader(request.headers.get("cookie")), userId))?.id ?? null;
    const body = await readJson<{ typing?: unknown }>(request).catch(() => ({ typing: false }));
    if (agentId) touchPresence(contactId, agentId, body.typing === true);
    return json({ others: othersHere(contactId, agentId) });
  } catch (error) {
    return fail(error);
  }
}
