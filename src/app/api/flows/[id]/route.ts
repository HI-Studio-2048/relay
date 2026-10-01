import { desc, eq, inArray } from "drizzle-orm";
import { syncBotCommands } from "@/lib/bot-commands";
import { assertConfirm } from "@/lib/broadcast";
import { getDb } from "@/lib/db";
import { flowVersions, flows } from "@/lib/db/schema";
import { agentIdFromCookieHeader, findMember } from "@/lib/team";
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
      priority?: number;
      definition?: FlowDefinition;
    }>(request);
    const db = await getDb();
    // Keep the version being replaced (definition / trigger edits only), newest 20 per flow.
    const [before] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
    const changed =
      before !== undefined &&
      ((body.definition !== undefined && JSON.stringify(body.definition) !== JSON.stringify(before.definition)) ||
        (body.triggerType !== undefined && body.triggerType !== before.triggerType) ||
        (body.triggerValue !== undefined && body.triggerValue !== before.triggerValue));
    if (changed) {
      const agent = await findMember(agentIdFromCookieHeader(request.headers.get("cookie")));
      await db.insert(flowVersions).values({
        id: crypto.randomUUID(),
        flowId: id,
        name: before.name,
        triggerType: before.triggerType,
        triggerValue: before.triggerValue,
        definition: before.definition,
        author: agent?.name ?? null,
      });
      const older = await db
        .select({ id: flowVersions.id })
        .from(flowVersions)
        .where(eq(flowVersions.flowId, id))
        .orderBy(desc(flowVersions.createdAt))
        .offset(20);
      if (older.length) await db.delete(flowVersions).where(inArray(flowVersions.id, older.map((row) => row.id)));
    }
    const [flow] = await db
      .update(flows)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.triggerType ? { triggerType: body.triggerType } : {}),
        ...(body.triggerValue !== undefined ? { triggerValue: body.triggerValue } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.definition ? { definition: body.definition } : {}),
        updatedAt: new Date(),
      })
      .where(eq(flows.id, id))
      .returning();
    if (!flow) return json({ error: "Flow not found" }, 404);
    if (body.triggerType !== undefined || body.triggerValue !== undefined || body.isActive !== undefined || body.name) {
      await syncBotCommands(flow.botId);
    }
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
    const [removed] = await db.delete(flows).where(eq(flows.id, id)).returning();
    if (removed?.triggerType === "command") await syncBotCommands(removed.botId);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
