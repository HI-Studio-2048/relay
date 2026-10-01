import { eq } from "drizzle-orm";
import { verifyZernioSignature } from "@/lib/channels/zernio";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, type RouteParams } from "@/lib/http";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

/**
 * Zernio delivers message.received / comment.received / referral.received here, signed with
 * X-Zernio-Signature: hex HMAC-SHA256 of the raw body keyed by the account's webhook secret.
 */
export async function POST(request: Request, context: RouteParams<{ botId: string }>) {
  const { botId } = await context.params;
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot || bot.channel !== "zernio") return json({ error: "Unknown account" }, 404);

  const raw = await request.text();
  const signature = request.headers.get("x-zernio-signature") ?? request.headers.get("x-late-signature");
  if (!verifyZernioSignature(bot.webhookSecret, raw, signature)) {
    log.warn("Zernio webhook signature mismatch", botId);
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: { event?: string } & Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  // webhook.test and every event Relay does not act on are acknowledged so Zernio stops retrying.
  if (payload.event === "message.received" || payload.event === "comment.received" || payload.event === "referral.received") {
    await enqueueWebhook({ kind: "webhook", botId, update: payload, eventId: request.headers.get("x-zernio-event-id") });
    if (shouldRunWorker()) void drainJobs(5);
  }
  return json({ ok: true });
}
