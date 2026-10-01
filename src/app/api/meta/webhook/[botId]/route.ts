import { eq } from "drizzle-orm";
import { accountFromRow } from "@/lib/channels";
import { verifyMetaSignature } from "@/lib/channels/meta";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, type RouteParams } from "@/lib/http";
import { adminPassword } from "@/lib/env";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

/**
 * One webhook URL per connected Meta account (Instagram, Messenger, WhatsApp).
 * Paste it in the Meta App dashboard with the account's verify token.
 */
export async function GET(request: Request, context: RouteParams<{ botId: string }>) {
  const { botId } = await context.params;
  const url = new URL(request.url);
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot) return json({ error: "Unknown account" }, 404);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === bot.webhookSecret && challenge) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return json({ error: "Verification failed" }, 403);
}

export async function POST(request: Request, context: RouteParams<{ botId: string }>) {
  const { botId } = await context.params;
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot) return json({ error: "Unknown account" }, 404);

  const raw = await request.text();
  const account = accountFromRow(bot);
  if (!verifyMetaSignature(account.appSecret, raw, request.headers.get("x-hub-signature-256"))) {
    log.warn("Meta webhook signature mismatch", botId);
    return json({ error: "Unauthorized" }, 401);
  }
  if (!account.appSecret) {
    // With a console password set this route is public, so unsigned payloads are refused outright.
    if (adminPassword()) {
      log.warn("Meta webhook rejected: add the app secret in Settings so signatures can be verified", botId);
      return json({ error: "App secret required" }, 401);
    }
    log.warn("Meta webhook accepted without an app secret; add one in Settings");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  await enqueueWebhook({ kind: "webhook", botId, update: payload });
  if (shouldRunWorker()) void drainJobs(5);
  return json({ ok: true });
}
