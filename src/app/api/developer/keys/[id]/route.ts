import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";

export async function DELETE(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
