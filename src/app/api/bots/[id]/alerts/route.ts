import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { notifyAdmin, readAlerts } from "@/lib/flow-effects";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json({ alerts: readAlerts(bot.settings) });
  } catch (error) {
    return fail(error);
  }
}

/** PUT { webhookUrl } saves the team alert webhook; POST sends a test alert. */
export async function PUT(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ webhookUrl?: string }>(request);
    const url = body.webhookUrl?.trim() ?? "";
    if (url && !readAlerts({ alerts: { webhookUrl: url } }).webhookUrl) return json({ error: "Use the https:// webhook URL from Slack, Discord or Teams" }, 400);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const alerts = readAlerts({ alerts: { webhookUrl: url } });
    await db.update(bots).set({ settings: { ...(bot.settings ?? {}), alerts }, updatedAt: new Date() }).where(eq(bots.id, id));
    return json({ alerts });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const delivered = await notifyAdmin("✅ Relay test alert: hand-offs, Notify admin steps and rule alerts will arrive here.", { botId: id });
    return delivered ? json({ ok: true }) : json({ error: "Nothing delivered — check the webhook URL" }, 400);
  } catch (error) {
    return fail(error);
  }
}
