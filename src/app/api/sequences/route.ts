import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { flows, sequences } from "@/lib/db/schema";
import { fail, json, readJson } from "@/lib/http";
import { createSequence, listSequences, replaceSequenceSteps } from "@/lib/sequences";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    return json({ sequences: await listSequences(botId) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      botId?: string;
      name?: string;
      steps?: { delaySeconds?: number; body?: string; flowId?: string | null }[];
    }>(request);
    if (!body.botId || !body.name?.trim()) return json({ error: "botId and name are required" }, 400);
    const db = await getDb();
    const owned = new Set((await db.select({ id: flows.id }).from(flows).where(eq(flows.botId, body.botId))).map((flow) => flow.id));
    const steps = (body.steps ?? []).map((step) => ({
      delaySeconds: step.delaySeconds ?? 0,
      body: step.body ?? "",
      flowId: step.flowId && owned.has(step.flowId) ? step.flowId : null,
    }));
    if (steps.filter((step) => step.body.trim() || step.flowId).length === 0) {
      return json({ error: "Add at least one message or flow" }, 400);
    }
    const id = await createSequence({ botId: body.botId, name: body.name, steps });
    return json({ ok: true, id });
  } catch (error) {
    return fail(error);
  }
}

/** PUT { id, botId, steps } replaces the messages of an existing sequence. */
export async function PUT(request: Request) {
  try {
    const body = await readJson<{ id?: string; botId?: string; steps?: { delaySeconds?: number; body?: string; flowId?: string | null }[] }>(request);
    if (!body.id || !body.botId) return json({ error: "id and botId are required" }, 400);
    const db = await getDb();
    const [sequence] = await db.select().from(sequences).where(and(eq(sequences.id, body.id), eq(sequences.botId, body.botId))).limit(1);
    if (!sequence) return json({ error: "Sequence not found" }, 404);
    const owned = new Set((await db.select({ id: flows.id }).from(flows).where(eq(flows.botId, body.botId))).map((flow) => flow.id));
    const steps = (body.steps ?? []).map((step) => ({
      delaySeconds: step.delaySeconds ?? 0,
      body: step.body ?? "",
      flowId: step.flowId && owned.has(step.flowId) ? step.flowId : null,
    }));
    if (steps.filter((step) => step.body.trim() || step.flowId).length === 0) return json({ error: "Add at least one message or flow" }, 400);
    await replaceSequenceSteps(body.id, steps);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

/** PATCH { id, botId, isActive } pauses or resumes a sequence. */
export async function PATCH(request: Request) {
  try {
    const body = await readJson<{ id?: string; botId?: string; isActive?: boolean }>(request);
    if (!body.id || !body.botId || typeof body.isActive !== "boolean") return json({ error: "id, botId and isActive are required" }, 400);
    const db = await getDb();
    await db.update(sequences).set({ isActive: body.isActive }).where(and(eq(sequences.id, body.id), eq(sequences.botId, body.botId)));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await readJson<{ id?: string; botId?: string; confirm?: boolean }>(request);
    if (!body.id || !body.botId || body.confirm !== true) {
      return json({ error: "id, botId, and confirm: true are required" }, 400);
    }
    const db = await getDb();
    await db.delete(sequences).where(and(eq(sequences.id, body.id), eq(sequences.botId, body.botId)));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
