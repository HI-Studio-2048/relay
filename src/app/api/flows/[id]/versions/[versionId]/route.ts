import { and, eq } from "drizzle-orm";
import { requireRowAccess } from "@/lib/auth/resources";
import { getDb } from "@/lib/db";
import { flowVersions, flows } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";

/** Restore a version. The current state is kept as a version first, so a restore can be undone. */
export async function POST(_request: Request, context: RouteParams<{ id: string; versionId: string }>) {
  try {
    const { id, versionId } = await context.params;
    await requireRowAccess("flow", id);
    const db = await getDb();
    const [version] = await db
      .select()
      .from(flowVersions)
      .where(and(eq(flowVersions.id, versionId), eq(flowVersions.flowId, id)))
      .limit(1);
    const [current] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
    if (!version || !current) return json({ error: "Version not found" }, 404);
    await db.insert(flowVersions).values({
      id: crypto.randomUUID(),
      flowId: id,
      name: current.name,
      triggerType: current.triggerType,
      triggerValue: current.triggerValue,
      definition: current.definition,
      author: "Before restore",
    });
    const [flow] = await db
      .update(flows)
      .set({ triggerType: version.triggerType, triggerValue: version.triggerValue, definition: version.definition, updatedAt: new Date() })
      .where(eq(flows.id, id))
      .returning();
    return json({ flow });
  } catch (error) {
    return fail(error);
  }
}
