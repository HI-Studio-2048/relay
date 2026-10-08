import { requireRowAccess } from "@/lib/auth/resources";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { savedReplies } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";

export async function DELETE(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("savedReply", id);
    const db = await getDb();
    await db.delete(savedReplies).where(eq(savedReplies.id, id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
