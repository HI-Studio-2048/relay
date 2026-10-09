import { requireRowAccess } from "@/lib/auth/resources";
import { logActivity } from "@/lib/activity";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";

export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("apiKey", id);
    const db = await getDb();
    const [removed] = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning();
    if (removed) await logActivity(request, removed.botId, "Revoked API key", `${removed.name} (${removed.prefix}…)`);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
