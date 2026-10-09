import { requireRowAccess } from "@/lib/auth/resources";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { webhookSubscriptions } from "@/lib/db/schema";
import { signWebhookBody } from "@/lib/developer";
import { json, fail, type RouteParams } from "@/lib/http";

/** Send a signed ping so the endpoint can be wired up before real traffic arrives. */
export async function POST(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("webhook", id);
    const db = await getDb();
    const [sub] = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, id)).limit(1);
    if (!sub) return json({ error: "Webhook not found" }, 404);
    const body = JSON.stringify({ id: crypto.randomUUID(), event: "ping", created_at: new Date().toISOString(), data: { message: "Hello from Recatch" } });
    let status: number | null = null;
    let error: string | null = null;
    try {
      const response = await fetch(sub.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-relay-event": "ping", "x-relay-signature": signWebhookBody(sub.secret, body) },
        body,
        signal: AbortSignal.timeout(5000),
      });
      status = response.status;
      if (!response.ok) error = `HTTP ${response.status}`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Delivery failed";
    }
    await db.update(webhookSubscriptions).set({ lastStatus: status, lastError: error, lastDeliveredAt: new Date() }).where(eq(webhookSubscriptions.id, id));
    return json({ ok: !error, status, error });
  } catch (error) {
    return fail(error);
  }
}
