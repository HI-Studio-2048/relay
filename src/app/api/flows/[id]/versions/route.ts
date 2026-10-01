import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { flowVersions } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(flowVersions)
      .where(eq(flowVersions.flowId, id))
      .orderBy(desc(flowVersions.createdAt))
      .limit(20);
    return json({
      versions: rows.map((row) => ({
        id: row.id,
        name: row.name,
        triggerType: row.triggerType,
        triggerValue: row.triggerValue,
        author: row.author,
        createdAt: row.createdAt,
        steps: ((row.definition as { steps?: unknown[] }).steps ?? []).length,
        definition: row.definition,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
