import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, type RouteParams } from "@/lib/http";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

export async function POST(request: Request, context: RouteParams<{ botId: string }>) {
  const { botId } = await context.params;
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot) return json({ error: "Unknown bot" }, 404);

  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== bot.webhookSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const update = await request.json();
  await enqueueWebhook({ kind: "webhook", botId, update });
  if (shouldRunWorker()) {
    void drainJobs(5);
  }
  return json({ ok: true });
}
