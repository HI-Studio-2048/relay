import { eq } from "drizzle-orm";
import { assertConfirm } from "@/lib/broadcast";
import { getDb } from "@/lib/db";
import { customFields } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ confirm?: unknown }>(request);
    assertConfirm(body.confirm, "Delete field");
    const db = await getDb();
    await db.delete(customFields).where(eq(customFields.id, id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
