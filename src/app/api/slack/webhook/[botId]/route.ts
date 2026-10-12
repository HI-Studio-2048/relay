import { eq } from "drizzle-orm";
import { accountFromRow } from "@/lib/channels";
import { verifySlackSignature, type SlackPayload } from "@/lib/channels/slack";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, type RouteParams } from "@/lib/http";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

/**
 * One URL per connected Slack app, for both Event Subscriptions (messages) and Interactivity (button taps).
 * Every request is checked against the app's signing secret before anything is read from it.
 */
export async function POST(request: Request, context: RouteParams<{ botId: string }>) {
  const { botId } = await context.params;
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot || bot.channel !== "slack") return json({ error: "Unknown account" }, 404);

  const raw = await request.text();
  const account = accountFromRow(bot);
  if (
    !account.appSecret ||
    !verifySlackSignature(account.appSecret, raw, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"))
  ) {
    log.warn("Slack webhook signature mismatch", botId);
    return json({ error: "Unauthorized" }, 401);
  }

  // Button taps arrive form-encoded as payload=<json>; events arrive as plain JSON.
  let payload: SlackPayload;
  try {
    const form = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
    payload = JSON.parse(form ? (new URLSearchParams(raw).get("payload") ?? "") : raw) as SlackPayload;
  } catch {
    return json({ error: "Invalid payload" }, 400);
  }

  if (payload.type === "url_verification" && payload.challenge) {
    return new Response(payload.challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  // Slack redelivers when we are slow to answer. The event id also dedupes, this just skips the work.
  if (request.headers.get("x-slack-retry-num")) return json({ ok: true });

  const eventId = payload.event_id ?? payload.trigger_id ?? null;
  await enqueueWebhook({ kind: "webhook", botId, update: payload, eventId });
  if (shouldRunWorker()) void drainJobs(5);
  return json({ ok: true });
}
