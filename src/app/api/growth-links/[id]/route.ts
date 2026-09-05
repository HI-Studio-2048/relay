import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { growthLinks } from "@/lib/db/schema";
import { fail, json, readJson, type RouteParams } from "@/lib/http";

export async function DELETE(request: Request, { params }: RouteParams<{ id: string }>) {
  try {
    const { id } = await params;
    const body = await readJson<{ confirm?: boolean }>(request);
    if (body.confirm !== true) return json({ error: "confirm: true is required" }, 400);
    const db = await getDb();
    const [row] = await db.select().from(growthLinks).where(eq(growthLinks.id, id)).limit(1);
    if (!row) return json({ error: "Not found" }, 404);
    await db.delete(growthLinks).where(eq(growthLinks.id, id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
