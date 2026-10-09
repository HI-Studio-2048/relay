import { logActivity } from "@/lib/activity";
import { and, eq, inArray } from "drizzle-orm";
import { requireRowAccess } from "@/lib/auth/resources";
import { canDispatchBroadcast } from "@/lib/broadcast";
import { EmptyAudienceError, materializeBroadcast } from "@/lib/broadcast-dispatch";
import { getDb } from "@/lib/db";
import { broadcasts } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { shouldRunWorker } from "@/lib/queue";
import type { BroadcastStatus } from "@/lib/types";
import { drainJobs } from "@/lib/worker";

async function readConfirm(request: Request): Promise<{ confirm: unknown; viaForm: boolean; scheduledAt: Date | null; smartTiming: boolean }> {
  const contentType = request.headers.get("content-type") ?? "";
  const parseWhen = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return null;
    const when = new Date(value);
    return Number.isFinite(when.getTime()) && when.getTime() > Date.now() + 30_000 ? when : null;
  };
  if (contentType.includes("application/json")) {
    const body = await readJson<{ confirm?: unknown; scheduledAt?: unknown; smartTiming?: unknown }>(request);
    return { confirm: body.confirm, viaForm: false, scheduledAt: parseWhen(body.scheduledAt), smartTiming: body.smartTiming === true };
  }
  const form = await request.formData();
  return {
    confirm: form.get("phrase") === "CONFIRM",
    viaForm: true,
    scheduledAt: parseWhen(form.get("scheduledAt")),
    smartTiming: form.get("smartTiming") === "on",
  };
}

export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("broadcast", id);
    const { confirm, viaForm, scheduledAt, smartTiming } = await readConfirm(request);
    const origin = new URL(request.url).origin;
    const redirectTo = (query: string) =>
      Response.redirect(`${origin}/broadcasts/${id}${query}`, 303);
    const db = await getDb();
    const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1);
    if (!broadcast) {
      return viaForm ? redirectTo("?error=missing") : json({ error: "Broadcast not found" }, 404);
    }

    const gate = canDispatchBroadcast({
      status: broadcast.status as BroadcastStatus,
      confirm,
    });
    if (!gate.ok) {
      return viaForm
        ? redirectTo(`?error=${gate.code}`)
        : json({ error: gate.error, code: gate.code }, 409);
    }

    if (scheduledAt) {
      const [scheduled] = await db
        .update(broadcasts)
        .set({ status: "scheduled", confirmedAt: new Date(), scheduledAt, smartTiming })
        .where(and(eq(broadcasts.id, id), inArray(broadcasts.status, ["draft", "awaiting_confirm"])))
        .returning();
      if (!scheduled) return viaForm ? redirectTo("?error=INVALID_STATUS") : json({ error: "Already confirmed" }, 409);
      await logActivity(request, broadcast.botId, "Scheduled broadcast", `${broadcast.name} for ${scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC`);
      return viaForm ? redirectTo("?scheduled=1") : json({ broadcast: scheduled });
    }

    let updated;
    try {
      // Only an unconfirmed broadcast takes the flag; a retried confirm must not flip a running one.
      await db
        .update(broadcasts)
        .set({ confirmedAt: new Date(), smartTiming })
        .where(and(eq(broadcasts.id, id), inArray(broadcasts.status, ["draft", "awaiting_confirm"])));
      updated = await materializeBroadcast(id, ["draft", "awaiting_confirm"]);
      if (!updated) return viaForm ? redirectTo("?queued=1") : json({ error: "Already confirmed" }, 409);
    } catch (error) {
      if (error instanceof EmptyAudienceError) {
        return viaForm ? redirectTo("?error=empty") : json({ error: error.message }, 400);
      }
      throw error;
    }
    await logActivity(request, broadcast.botId, "Sent broadcast", `${broadcast.name} to ${updated.totalCount} contacts${smartTiming ? " (smart time)" : ""}`);
    if (shouldRunWorker()) void drainJobs(5);
    return viaForm ? redirectTo("?queued=1") : json({ broadcast: updated });
  } catch (error) {
    return fail(error);
  }
}
