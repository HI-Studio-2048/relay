import { logActivity } from "@/lib/activity";
import { and, desc, eq, inArray } from "drizzle-orm";
import { syncBotCommands } from "@/lib/bot-commands";
import { assertConfirm } from "@/lib/broadcast";
import { requireUserId } from "@/lib/auth";
import { requireRowAccess } from "@/lib/auth/resources";
import { getDb } from "@/lib/db";
import { flowVersions, flows } from "@/lib/db/schema";
import { STALE_FLOW_CODE, STALE_FLOW_MESSAGE, flowStillAt, readBaseVersion } from "@/lib/flow-version";
import { agentIdFromCookieHeader, findMember } from "@/lib/team";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import type { FlowDefinition } from "@/lib/types";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("flow", id);
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
    await requireRowAccess("flow", id);
    const userId = await requireUserId();
    const body = await readJson<{
      name?: string;
      triggerType?: string;
      triggerValue?: string | null;
      isActive?: boolean;
      priority?: number;
      folder?: string | null;
      definition?: FlowDefinition;
      /** The flow's updatedAt when the editor loaded it. A save based on an older version is refused with 409. */
      baseUpdatedAt?: string;
    }>(request);
    const folderOnly = Object.keys(body).filter((key) => key !== "baseUpdatedAt").length === 1 && body.folder !== undefined;
    // The editor sends the version it loaded; other callers send none and are not checked.
    const base = readBaseVersion(body.baseUpdatedAt);
    const db = await getDb();
    const [before] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
    if (!before) return json({ error: "Flow not found" }, 404);
    const changed =
      (body.definition !== undefined && JSON.stringify(body.definition) !== JSON.stringify(before.definition)) ||
      (body.triggerType !== undefined && body.triggerType !== before.triggerType) ||
      (body.triggerValue !== undefined && body.triggerValue !== before.triggerValue);
    // Check and write in one statement, so two tabs saving at once can't both win.
    const [flow] = await db
      .update(flows)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.triggerType ? { triggerType: body.triggerType } : {}),
        ...(body.triggerValue !== undefined ? { triggerValue: body.triggerValue } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.definition ? { definition: body.definition } : {}),
        ...(body.folder !== undefined ? { folder: typeof body.folder === "string" && body.folder.trim() ? body.folder.trim().slice(0, 60) : null } : {}),
        ...(folderOnly ? {} : { updatedAt: new Date() }),
      })
      .where(base ? and(eq(flows.id, id), flowStillAt(base)) : eq(flows.id, id))
      .returning();
    if (!flow && base) {
      const [still] = await db.select({ id: flows.id }).from(flows).where(eq(flows.id, id)).limit(1);
      if (still) return json({ error: STALE_FLOW_MESSAGE, code: STALE_FLOW_CODE }, 409);
    }
    // Keep the version that was replaced (definition / trigger edits only), newest 20 per flow.
    if (flow && changed) {
      const agent = await findMember(agentIdFromCookieHeader(request.headers.get("cookie")), userId);
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
    if (!flow) return json({ error: "Flow not found" }, 404);
    if (body.isActive !== undefined && body.isActive !== before.isActive) {
      await logActivity(request, flow.botId, body.isActive ? "Turned on flow" : "Turned off flow", flow.name);
    }
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
    await requireRowAccess("flow", id);
    const body = await readJson<{ confirm?: unknown }>(request);
    assertConfirm(body.confirm, "Delete flow");
    const db = await getDb();
    const [removed] = await db.delete(flows).where(eq(flows.id, id)).returning();
    if (removed?.triggerType === "command") await syncBotCommands(removed.botId);
    if (removed) await logActivity(request, removed.botId, "Deleted flow", removed.name);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
