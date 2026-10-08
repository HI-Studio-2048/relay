import { requireRowAccess } from "@/lib/auth/resources";
import { eq } from "drizzle-orm";
import { assertConfirm } from "@/lib/broadcast";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("tag", id);
    const body = await readJson<{ confirm?: unknown }>(request);
    assertConfirm(body.confirm, "Delete tag");
    const db = await getDb();
    await db.delete(tags).where(eq(tags.id, id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
