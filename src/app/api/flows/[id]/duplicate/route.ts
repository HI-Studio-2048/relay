import { requireRowAccess } from "@/lib/auth/resources";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";

/** ManyChat "Duplicate": copies the definition, keeps the trigger, starts inactive so it cannot fire twice. */
export async function POST(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("flow", id);
    const db = await getDb();
    const [source] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
    if (!source) return json({ error: "Flow not found" }, 404);
    const [flow] = await db
      .insert(flows)
      .values({
        id: crypto.randomUUID(),
        botId: source.botId,
        name: `${source.name} (copy)`,
        triggerType: source.triggerType,
        triggerValue: source.triggerValue,
        isActive: false,
        priority: source.priority,
        definition: source.definition,
      })
      .returning();
    return json({ flow });
  } catch (error) {
    return fail(error);
  }
}
