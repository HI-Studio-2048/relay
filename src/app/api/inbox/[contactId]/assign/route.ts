import { requireBotAccess } from "@/lib/auth";
import { requireRowAccess } from "@/lib/auth/resources";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { assignContact, findMember } from "@/lib/team";

/** POST { memberId: string | null } — assign or unassign a conversation. */
export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const userId = await requireBotAccess(await requireRowAccess("contact", contactId));
    const body = await readJson<{ memberId?: string | null }>(request);
    const member = body.memberId ? await findMember(body.memberId, userId) : null;
    if (body.memberId && !member) return json({ error: "Team member not found" }, 404);
    await assignContact(contactId, member?.id ?? null);
    return json({ ok: true, assignedTo: member?.id ?? null });
  } catch (error) {
    return fail(error);
  }
}
