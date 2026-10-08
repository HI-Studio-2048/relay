import { syncBotCommands } from "@/lib/bot-commands";
import { graphGet } from "@/lib/channels/meta";
import { channelOf, type ChannelId } from "@/lib/channels/types";
import { and, eq } from "drizzle-orm";
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
    channel: channelOf(row.channel),
    telegramUsername: row.telegramUsername,
    telegramBotId: row.telegramBotId,
    externalAccountId: row.externalAccountId ?? null,
    hasAppSecret: Boolean(row.appSecretEncrypted),
    verifyToken: channelOf(row.channel) === "telegram" ? null : row.webhookSecret,
    webhookUrl: row.webhookUrl,
    status: row.status,
    lastHealthAt: row.lastHealthAt ? row.lastHealthAt.toISOString() : null,
    lastHealthError: row.lastHealthError,
    createdAt: row.createdAt.toISOString(),
  };
}

/** One channel account can only live in one workspace; refuse to take it over from another user. */
function assertOwnable(match: typeof bots.$inferSelect | undefined, ownerId: string) {
  if (match?.ownerId && match.ownerId !== ownerId) {
    throw new Error("This account is already connected to another Relay workspace");
  }
}

export async function connectBot(token: string, ownerId: string, origin?: string) {
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
  assertOwnable(match, ownerId);

  const webhookSecret = match?.webhookSecret ?? randomSecret();
  const id = match?.id ?? crypto.randomUUID();
  const originUrl = publicUrl(origin);
  const webhookUrl = originUrl ? `${originUrl}/api/telegram/webhook/${id}` : null;

  if (webhookUrl) {
    await setWebhook(token.trim(), webhookUrl, webhookSecret);
  }

  const values = {
    ownerId,
    name: me.username ? `@${me.username}` : me.first_name ?? "Telegram bot",
    channel: "telegram",
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
  await syncBotCommands(id);
  const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return publicBot(row!);
}

export type ChannelConnectInput = {
  channel: ChannelId;
  /** The user connecting the account; they become its owner. */
  ownerId: string;
  token: string;
  /** Page id / Instagram account id / WhatsApp phone number id. Required for Meta channels. */
  externalAccountId?: string | null;
  appSecret?: string | null;
  verifyToken?: string | null;
  origin?: string;
};

type MetaAccountInfo = { name: string; handle: string | null };

/** Validate a Meta access token against the account it should manage, and read its display name. */
async function describeMetaAccount(channel: ChannelId, token: string, accountId: string): Promise<MetaAccountInfo> {
  if (channel === "whatsapp") {
    const info = await graphGet<{ display_phone_number?: string; verified_name?: string }>(
      `${accountId}?fields=display_phone_number,verified_name`,
      token,
    );
    return {
      name: info.verified_name ? `${info.verified_name} (WhatsApp)` : "WhatsApp number",
      handle: info.display_phone_number ?? null,
    };
  }
  if (channel === "instagram") {
    const info = await graphGet<{ name?: string; username?: string; instagram_business_account?: { id?: string; username?: string } }>(
      `${accountId}?fields=name,username,instagram_business_account{id,username}`,
      token,
    );
    const igHandle = info.instagram_business_account?.username ?? info.username ?? null;
    return { name: igHandle ? `@${igHandle} (Instagram)` : info.name ?? "Instagram account", handle: igHandle };
  }
  const info = await graphGet<{ name?: string; username?: string }>(`${accountId}?fields=name,username`, token);
  return { name: info.name ? `${info.name} (Messenger)` : "Facebook Page", handle: info.username ?? null };
}

/**
 * Connect any channel. Telegram keeps its BotFather flow; Meta channels store the access token,
 * validate it against the Graph API, and hand back the webhook URL + verify token to paste in Meta's dashboard.
 */
export async function connectChannelAccount(input: ChannelConnectInput) {
  if (input.channel === "telegram") return connectBot(input.token, input.ownerId, input.origin);
  const token = input.token.trim();
  const accountId = (input.externalAccountId ?? "").trim();
  if (!accountId) {
    throw new Error(
      input.channel === "whatsapp" ? "WhatsApp needs the Phone number ID" : "Enter the Facebook Page ID that owns this account",
    );
  }
  const info = await describeMetaAccount(input.channel, token, accountId);

  const db = await getDb();
  const existing = await db.select().from(bots);
  const match = existing.find((row) => channelOf(row.channel) === input.channel && row.externalAccountId === accountId);
  assertOwnable(match, input.ownerId);
  const id = match?.id ?? crypto.randomUUID();
  const webhookSecret = input.verifyToken?.trim() || match?.webhookSecret || randomSecret(12);
  const originUrl = publicUrl(input.origin);
  const webhookUrl = originUrl ? `${originUrl}/api/meta/webhook/${id}` : null;

  const values = {
    ownerId: input.ownerId,
    name: info.name,
    channel: input.channel,
    telegramUsername: info.handle,
    telegramBotId: null,
    externalAccountId: accountId,
    tokenEncrypted: encryptSecret(token),
    appSecretEncrypted: input.appSecret?.trim() ? encryptSecret(input.appSecret.trim()) : match?.appSecretEncrypted ?? null,
    webhookSecret,
    webhookUrl,
    status: webhookUrl ? "connected" : "disconnected",
    lastHealthAt: new Date(),
    lastHealthError: webhookUrl
      ? null
      : "PUBLIC_URL not set — Meta cannot reach this server. Set it and reconnect.",
    updatedAt: new Date(),
  };
  if (match) await db.update(bots).set(values).where(eq(bots.id, id));
  else await db.insert(bots).values({ id, ...values });

  await seedBotDefaults(id);
  const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return publicBot(row!);
}

export async function healthCheckBot(botId: string, origin?: string) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot) throw new Error("Bot not found");
  const token = decryptSecret(bot.tokenEncrypted);
  if (channelOf(bot.channel) !== "telegram") {
    let error: string | null = null;
    let name = bot.name;
    try {
      name = (await describeMetaAccount(channelOf(bot.channel), token, bot.externalAccountId ?? "")).name;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Token check failed";
    }
    await db
      .update(bots)
      .set({
        name,
        status: error ? "error" : "connected",
        lastHealthAt: new Date(),
        lastHealthError: error,
        updatedAt: new Date(),
      })
      .where(eq(bots.id, botId));
    const [updated] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    return { bot: publicBot(updated!), webhook: null, me: null };
  }
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

/** The channel accounts one user owns. */
export async function listBots(ownerId: string) {
  const db = await getDb();
  const rows = await db.select().from(bots).where(eq(bots.ownerId, ownerId));
  return rows.map(publicBot);
}

/** A channel account, only if `ownerId` owns it. */
export async function getBot(botId: string, ownerId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.ownerId, ownerId)))
    .limit(1);
  return row ? publicBot(row) : null;
}

export async function decryptBotToken(botId: string) {
  const db = await getDb();
  const [row] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!row) throw new Error("Bot not found");
  return decryptSecret(row.tokenEncrypted);
}
