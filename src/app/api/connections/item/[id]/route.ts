import { requireUserId } from "@/lib/auth";
import { fail, json, type RouteParams } from "@/lib/http";
import { disconnectConnection } from "@/lib/oauth/connections";

/** Disconnect an account. Only its owner can; the stored tokens are deleted with the row. */
export async function DELETE(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const removed = await disconnectConnection(userId, id);
    return removed ? json({ ok: true }) : json({ error: "Connection not found" }, 404);
  } catch (error) {
    return fail(error);
  }
}
