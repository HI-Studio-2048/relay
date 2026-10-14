import { and, eq } from "drizzle-orm";
import { syncZernioBot } from "@/lib/bots";
import { verifyZernioSignature, zernioCompanyKey, zernioProfileOwner, zernioWebhookSecret } from "@/lib/channels/zernio";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json } from "@/lib/http";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

type ProfileRef = string | { _id?: string; id?: string; externalId?: string | null } | null | undefined;
type Delivery = {
  event?: string;
  profiles?: { id?: string; externalId?: string | null }[];
  profile?: ProfileRef;
  account?: { profileId?: ProfileRef } & Record<string, unknown>;
} & Record<string, unknown>;

/**
 * The Recatch user an event belongs to: the externalId of the Zernio profile it names. Zernio has put the
 * profile in `profiles`, in `profile`, or on the account (as an object or a bare id), so look in each.
 */
async function ownerOf(payload: Delivery): Promise<string | null> {
  const refs: ProfileRef[] = [...(payload.profiles ?? []), payload.profile, payload.account?.profileId];
  for (const ref of refs) if (ref && typeof ref === "object" && ref.externalId) return ref.externalId;
  const ids = refs.map((ref) => (typeof ref === "string" ? ref : ref?._id ?? ref?.id)).filter((id): id is string => Boolean(id));
  const apiKey = zernioCompanyKey();
  for (const id of ids) {
    const owner = apiKey ? await zernioProfileOwner(apiKey, id).catch(() => null) : null;
    if (owner) return owner;
  }
  return null;
}

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
  const event = payload.event ?? "";
  if (!INBOUND.includes(event) && !ACCOUNT.includes(event)) return json({ ok: true });
  const ownerId = await ownerOf(payload);
  if (!ownerId) {
    log.warn(`Zernio ${event} names no Recatch user; payload keys:`, Object.keys(payload).join(","));
    return json({ ok: true });
  }

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
