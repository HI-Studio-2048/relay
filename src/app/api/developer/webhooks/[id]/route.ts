import { requireRowAccess } from "@/lib/auth/resources";
import { logActivity } from "@/lib/activity";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { webhookSubscriptions } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

export async function PATCH(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("webhook", id);
    const body = await readJson<{ isActive?: boolean }>(request);
    const db = await getDb();
    const [row] = await db
      .update(webhookSubscriptions)
      .set({ ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}) })
      .where(eq(webhookSubscriptions.id, id))
      .returning();
    return json({ webhook: row });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("webhook", id);
    const db = await getDb();
    const [removed] = await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, id)).returning();
    if (removed) await logActivity(request, removed.botId, "Removed webhook", removed.url);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
