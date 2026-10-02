import { eq } from "drizzle-orm";
import { assertConfirm } from "@/lib/broadcast";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ confirm?: unknown }>(request);
    assertConfirm(body.confirm, "Delete tag");
    const db = await getDb();
    try {
      await db.delete(tags).where(eq(tags.id, id));
    } catch {
      // Broadcasts keep a hard reference to the tag they were sent to.
      return json({ error: "A broadcast was sent to this tag, so it is kept for its history" }, 409);
    }
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
