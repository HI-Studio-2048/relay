import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sequences } from "@/lib/db/schema";
import { fail, json, readJson } from "@/lib/http";
import { createSequence, listSequences } from "@/lib/sequences";

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
      steps?: { delaySeconds?: number; body?: string }[];
    }>(request);
    if (!body.botId || !body.name?.trim()) return json({ error: "botId and name are required" }, 400);
    const steps = (body.steps ?? []).map((step) => ({
      delaySeconds: step.delaySeconds ?? 0,
      body: step.body ?? "",
    }));
    if (steps.filter((step) => step.body.trim()).length === 0) {
      return json({ error: "Add at least one message" }, 400);
    }
    const id = await createSequence({ botId: body.botId, name: body.name, steps });
    return json({ ok: true, id });
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
