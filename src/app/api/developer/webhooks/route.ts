import { requireBotAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { desc, eq } from "drizzle-orm";
import { randomSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { webhookSubscriptions } from "@/lib/db/schema";
import { isWebhookEvent } from "@/lib/developer";
import { json, fail, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    const db = await getDb();
    const rows = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.botId, botId)).orderBy(desc(webhookSubscriptions.createdAt));
    return json({ webhooks: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; url?: string; events?: string[] }>(request);
    const url = body.url?.trim() ?? "";
    // Plain http is allowed outside production so a local receiver can be wired up.
    const allowed = /^https:\/\//i.test(url) || (process.env.NODE_ENV !== "production" && /^http:\/\//i.test(url));
    if (!body.botId || !allowed) return json({ error: "botId and an https:// URL are required" }, 400);
    await requireBotAccess(body.botId);
    const events = [...new Set((body.events ?? []).filter(isWebhookEvent))];
    if (events.length === 0) return json({ error: "Pick at least one event" }, 400);
    const db = await getDb();
    const [row] = await db
      .insert(webhookSubscriptions)
      .values({ id: crypto.randomUUID(), botId: body.botId, url, secret: randomSecret(), events })
      .returning();
    await logActivity(request, body.botId, "Added webhook", url);
    return json({ webhook: row });
  } catch (error) {
    return fail(error);
  }
}
