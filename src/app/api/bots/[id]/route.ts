import { eq } from "drizzle-orm";
import { assertConfirm } from "@/lib/broadcast";
import { requireBotAccess, requireUserId } from "@/lib/auth";
import { getBot } from "@/lib/bots";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { deleteWebhook } from "@/lib/telegram";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const bot = await getBot(id, await requireUserId());
    if (!bot) return json({ error: "Bot not found" }, 404);
    return json({ bot });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const body = await readJson<{ confirm?: unknown }>(request);
    assertConfirm(body.confirm, "Delete bot");
    const db = await getDb();
    const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!row) return json({ error: "Bot not found" }, 404);
    if ((row.channel ?? "telegram") === "telegram") {
      try {
        await deleteWebhook(decryptSecret(row.tokenEncrypted));
      } catch {
        // still delete locally
      }
    }
    await db.delete(bots).where(eq(bots.id, id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
