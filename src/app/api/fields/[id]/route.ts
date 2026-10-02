import { eq } from "drizzle-orm";
import { assertConfirm } from "@/lib/broadcast";
import { getDb } from "@/lib/db";
import { customFields } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

/** PATCH { label } renames how a field is shown; the key (used in flows) stays the same. */
export async function PATCH(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ label?: string }>(request);
    const label = body.label?.trim().slice(0, 80);
    if (!label) return json({ error: "Label is required" }, 400);
    const db = await getDb();
    const [field] = await db.update(customFields).set({ label }).where(eq(customFields.id, id)).returning();
    if (!field) return json({ error: "Field not found" }, 404);
    return json({ field });
  } catch (error) {
    return fail(error);
  }
}

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
