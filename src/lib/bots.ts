import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, randomSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { publicUrl } from "@/lib/env";
import { seedBotDefaults } from "@/lib/store";
import { getMe, getWebhookInfo, setWebhook } from "@/lib/telegram";

export function publicBot(row: typeof bots.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    telegramUsername: row.telegramUsername,
    telegramBotId: row.telegramBotId,
    webhookUrl: row.webhookUrl,
    status: row.status,
    lastHealthAt: row.lastHealthAt ? row.lastHealthAt.toISOString() : null,
    lastHealthError: row.lastHealthError,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function connectBot(token: string, origin?: string) {
  const me = await getMe(token.trim());
  const db = await getDb();
  const existing = await db.select().from(bots);
  const match = existing.find((row) => {
    try {
      return decryptSecret(row.tokenEncrypted) === token.trim();
    } catch {
      return row.telegramBotId === String(me.id);
    }
  });

  const webhookSecret = match?.webhookSecret ?? randomSecret();
  const id = match?.id ?? crypto.randomUUID();
  const originUrl = publicUrl(origin);
  const webhookUrl = originUrl ? `${originUrl}/api/telegram/webhook/${id}` : null;

  if (webhookUrl) {
    await setWebhook(token.trim(), webhookUrl, webhookSecret);
  }

  const values = {
    name: me.username ? `@${me.username}` : me.first_name ?? "Telegram bot",
    telegramUsername: me.username ?? null,
    telegramBotId: String(me.id),
    tokenEncrypted: encryptSecret(token.trim()),
    webhookSecret,
    webhookUrl,
    status: webhookUrl ? "connected" : "disconnected",
    lastHealthAt: new Date(),
    lastHealthError: webhookUrl ? null : "PUBLIC_URL not set — webhook skipped. Save origin and reconnect.",
    updatedAt: new Date(),
  };

  if (match) {
    await db.update(bots).set(values).where(eq(bots.id, id));
  } else {
    await db.insert(bots).values({ id, ...values });
  }

  await seedBotDefaults(id);
  const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return publicBot(row!);
}

export async function healthCheckBot(botId: string, origin?: string) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot) throw new Error("Bot not found");
  const token = decryptSecret(bot.tokenEncrypted);
  const me = await getMe(token);
  const originUrl = publicUrl(origin);
  const webhookUrl = originUrl ? `${originUrl}/api/telegram/webhook/${bot.id}` : bot.webhookUrl;
  if (webhookUrl) {
    await setWebhook(token, webhookUrl, bot.webhookSecret);
  }
  const info = await getWebhookInfo(token);
  const ok = Boolean(webhookUrl && info.url === webhookUrl);
  await db
    .update(bots)
    .set({
      name: me.username ? `@${me.username}` : bot.name,
      telegramUsername: me.username ?? bot.telegramUsername,
      webhookUrl: webhookUrl ?? bot.webhookUrl,
      status: ok ? "connected" : "error",
      lastHealthAt: new Date(),
      lastHealthError: ok ? null : info.last_error_message ?? "Webhook URL mismatch or missing PUBLIC_URL",
      updatedAt: new Date(),
    })
    .where(eq(bots.id, botId));
  const [updated] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  return { bot: publicBot(updated!), webhook: info, me };
}

export async function listBots() {
  const db = await getDb();
  const rows = await db.select().from(bots);
  return rows.map(publicBot);
}

export async function getBot(botId: string) {
  const db = await getDb();
  const [row] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  return row ? publicBot(row) : null;
}

export async function decryptBotToken(botId: string) {
  const db = await getDb();
  const [row] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!row) throw new Error("Bot not found");
  return decryptSecret(row.tokenEncrypted);
}
