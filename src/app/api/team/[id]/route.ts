import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { contacts, teamMembers } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";
import { findMember } from "@/lib/team";

export async function DELETE(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const ownerId = await requireUserId();
    if (!(await findMember(id, ownerId))) return json({ error: "Team member not found" }, 404);
    const db = await getDb();
    await db.update(contacts).set({ assignedTo: null }).where(eq(contacts.assignedTo, id));
    await db.delete(teamMembers).where(and(eq(teamMembers.id, id), eq(teamMembers.ownerId, ownerId)));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
