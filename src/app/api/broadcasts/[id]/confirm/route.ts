import { eq } from "drizzle-orm";
import { canDispatchBroadcast, nextBroadcastStatusAfterConfirm } from "@/lib/broadcast";
import { getDb } from "@/lib/db";
import { broadcastRecipients, broadcasts } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { enqueueBroadcast, shouldRunWorker } from "@/lib/queue";
import { broadcastAudience } from "@/lib/store";
import type { BroadcastStatus } from "@/lib/types";
import { drainJobs } from "@/lib/worker";

async function readConfirm(request: Request): Promise<{ confirm: unknown; viaForm: boolean }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await readJson<{ confirm?: unknown }>(request);
    return { confirm: body.confirm, viaForm: false };
  }
  const form = await request.formData();
  return { confirm: form.get("phrase") === "CONFIRM", viaForm: true };
}

export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const { confirm, viaForm } = await readConfirm(request);
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

    const audience = await broadcastAudience(broadcast.botId, broadcast.tagId);
    if (audience.length === 0) {
      return viaForm
        ? redirectTo("?error=empty")
        : json(
            { error: broadcast.tagId ? "No contacts have this tag. Nothing to send." : "No subscribed contacts yet." },
            400,
          );
    }

    await db.delete(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, id));
    await db.insert(broadcastRecipients).values(
      audience.map((contact) => ({
        id: crypto.randomUUID(),
        broadcastId: id,
        contactId: contact.id,
        status: "pending",
      })),
    );

    const [updated] = await db
      .update(broadcasts)
      .set({
        status: nextBroadcastStatusAfterConfirm(),
        confirmedAt: new Date(),
        totalCount: audience.length,
        sentCount: 0,
        failedCount: 0,
      })
      .where(eq(broadcasts.id, id))
      .returning();

    await enqueueBroadcast({ kind: "broadcast", broadcastId: id });
    if (shouldRunWorker()) void drainJobs(5);
    return viaForm ? redirectTo("?queued=1") : json({ broadcast: updated });
  } catch (error) {
    return fail(error);
  }
}
