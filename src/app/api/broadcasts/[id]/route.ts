import { requireRowAccess } from "@/lib/auth/resources";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { broadcastRecipients, broadcasts } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("broadcast", id);
    const db = await getDb();
    const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1);
    if (!broadcast) return json({ error: "Broadcast not found" }, 404);
    const recipients = await db
      .select()
      .from(broadcastRecipients)
      .where(eq(broadcastRecipients.broadcastId, id));
    return json({ broadcast, recipients });
  } catch (error) {
    return fail(error);
  }
}
