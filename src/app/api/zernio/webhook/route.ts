import { and, eq } from "drizzle-orm";
import { syncZernioBot } from "@/lib/bots";
import { verifyZernioSignature, zernioWebhookSecret } from "@/lib/channels/zernio";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json } from "@/lib/http";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

type Delivery = { event?: string; profiles?: { id?: string; externalId?: string | null }[] } & Record<string, unknown>;

const INBOUND = ["message.received", "comment.received", "referral.received"];
const ACCOUNT = ["account.connected", "account.disconnected"];

/**
 * One webhook for every customer. Zernio signs the raw body with X-Zernio-Signature (hex HMAC-SHA256 keyed by
 * ZERNIO_WEBHOOK_SECRET) and names the customer's profile in `profiles`. The profile's externalId is the Recatch
 * user id, which finds that user's Meta account. An event with no profile belongs to nobody and is dropped.
 */
export async function POST(request: Request) {
  const secret = zernioWebhookSecret();
  if (!secret) return json({ error: "Zernio is not configured" }, 503);
  const raw = await request.text();
  const signature = request.headers.get("x-zernio-signature") ?? request.headers.get("x-late-signature");
  if (!verifyZernioSignature(secret, raw, signature)) {
    log.warn("Zernio webhook signature mismatch");
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: Delivery;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  // Test pings and every event Recatch does not act on are acknowledged so Zernio stops retrying.
  const ownerId = payload.profiles?.find((profile) => profile.externalId)?.externalId ?? null;
  const event = payload.event ?? "";
  if (!ownerId || (!INBOUND.includes(event) && !ACCOUNT.includes(event))) return json({ ok: true });

  if (ACCOUNT.includes(event)) {
    await syncZernioBot(ownerId).catch((error) => log.warn("Zernio account sync failed", error instanceof Error ? error.message : error));
    return json({ ok: true });
  }
  const db = await getDb();
  const rows = await db.select().from(bots).where(and(eq(bots.ownerId, ownerId), eq(bots.channel, "zernio")));
  const bot = rows.find((row) => row.settings?.zernioManaged === true);
  if (!bot) return json({ ok: true });
  await enqueueWebhook({ kind: "webhook", botId: bot.id, update: payload, eventId: request.headers.get("x-zernio-event-id") });
  if (shouldRunWorker()) void drainJobs(5);
  return json({ ok: true });
}
