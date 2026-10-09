import { requireBotAccess } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { generateApiKey } from "@/lib/developer";
import { json, fail, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    const db = await getDb();
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.botId, botId)).orderBy(desc(apiKeys.createdAt));
    return json({
      keys: rows.map((row) => ({ id: row.id, name: row.name, prefix: row.prefix, lastUsedAt: row.lastUsedAt, createdAt: row.createdAt })),
    });
  } catch (error) {
    return fail(error);
  }
}

/** Create a key. The plaintext key is returned once and never stored. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; name?: string }>(request);
    if (!body.botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(body.botId);
    const { key, hash, prefix } = generateApiKey();
    const db = await getDb();
    const [row] = await db
      .insert(apiKeys)
      .values({ id: crypto.randomUUID(), botId: body.botId, name: body.name?.trim().slice(0, 60) || "API key", keyHash: hash, prefix })
      .returning();
    await logActivity(request, body.botId, "Created API key", `${row!.name} (${prefix}…)`);
    return json({ key, record: { id: row!.id, name: row!.name, prefix, createdAt: row!.createdAt } });
  } catch (error) {
    return fail(error);
  }
}
