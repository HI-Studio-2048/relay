import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiKeys, webhookSubscriptions } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import type { ContactRecord } from "@/lib/types";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";

/** The contact shape the public API and webhooks expose (internal `_` fields hidden). */
export function publicContact(contact: ContactRecord) {
  return {
    id: contact.id,
    external_id: contact.telegramUserId,
    platform: contact.platform ?? null,
    username: contact.username,
    first_name: contact.firstName,
    last_name: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    tags: contact.tags,
    fields: Object.fromEntries(Object.entries(contact.customFields).filter(([key]) => !key.startsWith("_"))),
    lists: contact.subscriptions ?? [],
    unsubscribed: Boolean(contact.unsubscribed),
  };
}

/** Events Recatch can push to your endpoints. */
export { WEBHOOK_EVENTS };

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["value"];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return WEBHOOK_EVENTS.some((event) => event.value === value);
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** A new key, shown once. Stored as a hash plus a short prefix for the UI. */
export function generateApiKey() {
  const key = `rly_${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 10) };
}

export class ApiAuthError extends Error {
  constructor(message = "Missing or invalid API key. Send Authorization: Bearer rly_…") {
    super(message);
    this.name = "ApiAuthError";
  }
}

/** Resolve the account an API request acts on. */
export async function authenticateApiKey(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const key = header.replace(/^Bearer\s+/i, "").trim();
  if (!key.startsWith("rly_")) throw new ApiAuthError();
  const db = await getDb();
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(key))).limit(1);
  if (!row) throw new ApiAuthError();
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => undefined);
  return { botId: row.botId, keyId: row.id };
}

export function signWebhookBody(secret: string, body: string) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Fan an event out to every active subscription on the account that wants it. Fire-and-forget:
 * a slow or failing endpoint never delays a conversation. Delivery status is kept per subscription.
 */
export async function emitWebhook(botId: string, event: WebhookEvent, data: Record<string, unknown>) {
  let subscriptions;
  try {
    const db = await getDb();
    subscriptions = await db
      .select()
      .from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.botId, botId), eq(webhookSubscriptions.isActive, true)));
  } catch (error) {
    log.warn("Webhook lookup failed", error instanceof Error ? error.message : error);
    return;
  }
  const targets = subscriptions.filter((sub) => (sub.events ?? []).includes(event));
  if (targets.length === 0) return;
  const body = JSON.stringify({ id: crypto.randomUUID(), event, created_at: new Date().toISOString(), data });
  await Promise.all(
    targets.map(async (sub) => {
      let status: number | null = null;
      let error: string | null = null;
      try {
        const response = await fetch(sub.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "Relay-Webhooks/1",
            "x-relay-event": event,
            "x-relay-signature": signWebhookBody(sub.secret, body),
          },
          body,
          signal: AbortSignal.timeout(5000),
        });
        status = response.status;
        if (!response.ok) error = `HTTP ${response.status}`;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : "Delivery failed";
      }
      try {
        const db = await getDb();
        await db
          .update(webhookSubscriptions)
          .set({ lastStatus: status, lastError: error, lastDeliveredAt: new Date() })
          .where(eq(webhookSubscriptions.id, sub.id));
      } catch {
        // Status bookkeeping is best effort.
      }
    }),
  );
}

/** Do not await in hot paths. */
export function emitWebhookSoon(botId: string, event: WebhookEvent, data: Record<string, unknown>) {
  void emitWebhook(botId, event, data).catch((error) => log.warn("Webhook emit failed", error instanceof Error ? error.message : error));
}
