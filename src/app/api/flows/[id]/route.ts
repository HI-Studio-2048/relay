import { eq } from "drizzle-orm";
import { assertConfirm } from "@/lib/broadcast";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import type { FlowDefinition } from "@/lib/types";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const [flow] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
    if (!flow) return json({ error: "Flow not found" }, 404);
    return json({ flow });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{
      name?: string;
      triggerType?: string;
      triggerValue?: string | null;
      isActive?: boolean;
      definition?: FlowDefinition;
    }>(request);
    const db = await getDb();
    const [flow] = await db
      .update(flows)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.triggerType ? { triggerType: body.triggerType } : {}),
        ...(body.triggerValue !== undefined ? { triggerValue: body.triggerValue } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.definition ? { definition: body.definition } : {}),
        updatedAt: new Date(),
      })
      .where(eq(flows.id, id))
      .returning();
    if (!flow) return json({ error: "Flow not found" }, 404);
    return json({ flow });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ confirm?: unknown }>(request);
    assertConfirm(body.confirm, "Delete flow");
    const db = await getDb();
    await db.delete(flows).where(eq(flows.id, id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
