import { requireBotAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { readSavedSegments, sanitizeSegment } from "@/lib/segments";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json({ segments: readSavedSegments(bot.settings) });
  } catch (error) {
    return fail(error);
  }
}

/** POST { name, segment } saves (or replaces by name); DELETE ?segmentId= removes one. */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const body = await readJson<{ name?: string; segment?: unknown }>(request);
    const name = body.name?.trim().slice(0, 60);
    if (!name) return json({ error: "Name the segment" }, 400);
    const segment = sanitizeSegment(body.segment);
    if (segment.conditions.length === 0) return json({ error: "Add at least one condition first" }, 400);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const existing = readSavedSegments(bot.settings).filter((item) => item.name.toLowerCase() !== name.toLowerCase());
    const segments = [...existing, { id: crypto.randomUUID(), name, segment }].slice(-50);
    await db.update(bots).set({ settings: { ...(bot.settings ?? {}), segments }, updatedAt: new Date() }).where(eq(bots.id, id));
    return json({ segments });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const segmentId = new URL(request.url).searchParams.get("segmentId");
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const segments = readSavedSegments(bot.settings).filter((item) => item.id !== segmentId);
    await db.update(bots).set({ settings: { ...(bot.settings ?? {}), segments }, updatedAt: new Date() }).where(eq(bots.id, id));
    return json({ segments });
  } catch (error) {
    return fail(error);
  }
}
