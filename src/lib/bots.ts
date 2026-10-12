import { syncBotCommands } from "@/lib/bot-commands";
import { fetchDiscordBot } from "@/lib/channels/discord";
import { type SlackInstall } from "@/lib/channels/slack-install";
import { checkBlueskyAccount, forgetBlueskySession, explainBlueskyError } from "@/lib/channels/bluesky";
import { fetchSlackIdentity } from "@/lib/channels/slack";
import { graphGet } from "@/lib/channels/meta";
import { channelOf, type ChannelId } from "@/lib/channels/types";
import { listZernioAccounts, registerZernioWebhook, type ZernioAccount } from "@/lib/channels/zernio";
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
    /** Slack: installed through Add to Slack, so there is nothing to paste into a Slack app. */
    slackInstalled: row.settings?.slackInstalled === true,
    /** Discord: a server added through Add to Discord, answered by the shared bot. */
    discordShared: row.settings?.discordShared === true,
    verifyToken: channelOf(row.channel) === "telegram" ? null : row.webhookSecret,
    webhookUrl: row.webhookUrl,
    /** Zernio: the social accounts this key routes, for badges and the account picker. */
    linkedAccounts: (row.settings?.zernioAccounts as LinkedAccount[] | undefined) ?? [],
    status: row.status,
    lastHealthAt: row.lastHealthAt ? row.lastHealthAt.toISOString() : null,
    lastHealthError: row.lastHealthError,
    createdAt: row.createdAt.toISOString(),
  };
}

export type LinkedAccount = {
  id: string;
  platform: string;
  username: string | null;
  picture: string | null;
  /** Zernio lost access (token expired or permissions revoked): the person must reconnect. */
  needsReconnection?: boolean;
};

function linkedAccounts(accounts: ZernioAccount[], filter: string | null): LinkedAccount[] {
  const allowed = (filter ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return accounts
    .filter((account) => allowed.length === 0 || allowed.includes(account._id))
    .map((account) => ({
      id: account._id,
      platform: account.platform,
      username: account.username ?? account.displayName ?? null,
      picture: account.profilePicture ?? null,
      needsReconnection: Boolean(account.needsReconnection) || account.isActive === false,
    }));
}

function zernioName(accounts: LinkedAccount[]) {
  if (accounts.length === 1) return `${accounts[0]!.username ? `@${accounts[0]!.username}` : accounts[0]!.platform} (Zernio)`;
  return `Zernio · ${accounts.length} social account${accounts.length === 1 ? "" : "s"}`;
}

/**
 * Connect a Zernio workspace. The API key reaches every social account in it; externalAccountId
 * optionally narrows Recatch to a comma-separated list of Zernio account ids. Recatch registers its own
 * webhook (message.received, comment.received, referral.received) signed with a fresh secret.
 */
/** One channel account can only live in one workspace; refuse to take it over from another user. */
function assertOwnable(match: typeof bots.$inferSelect | undefined, ownerId: string) {
  if (match?.ownerId && match.ownerId !== ownerId) {
    throw new Error("This account is already connected to another Recatch workspace");
  }
}

export async function connectZernio(input: {
  apiKey: string;
  ownerId: string;
  accountFilter?: string | null;
  origin?: string;
}) {
  const apiKey = input.apiKey.trim();
  const filter = (input.accountFilter ?? "").trim() || null;
  const accounts = linkedAccounts(await listZernioAccounts(apiKey), filter);

  const db = await getDb();
  const existing = await db.select().from(bots);
  const match = existing.find((row) => {
    if (channelOf(row.channel) !== "zernio") return false;
    try {
      return decryptSecret(row.tokenEncrypted) === apiKey && (row.externalAccountId ?? null) === filter;
    } catch {
      return false;
    }
  });
  // A typo on first connect is an error; an existing account whose last account was disconnected is fine.
  if (filter && accounts.length === 0 && !match) throw new Error("None of those Zernio account ids belong to this API key");
  assertOwnable(match, input.ownerId);
  const id = match?.id ?? crypto.randomUUID();
  const webhookSecret = match?.webhookSecret ?? randomSecret();
  const originUrl = publicUrl(input.origin);
  const webhookUrl = originUrl ? `${originUrl}/api/zernio/webhook/${id}` : null;
  const settings = { ...(match?.settings ?? {}), zernioAccounts: accounts } as Record<string, unknown>;

  let error: string | null = webhookUrl ? null : "PUBLIC_URL not set — Zernio cannot reach this server. Set it and reconnect.";
  if (webhookUrl) {
    try {
      settings.zernioWebhookId = await registerZernioWebhook(apiKey, {
        url: webhookUrl,
        secret: webhookSecret,
        existingId: (match?.settings?.zernioWebhookId as string | undefined) ?? null,
        accountIds: filter ? accounts.map((account) => account.id) : undefined,
      });
    } catch (caught) {
      error = `Webhook not registered (${caught instanceof Error ? caught.message : "error"}). Add it in Zernio → Webhooks with the URL and signing secret below.`;
    }
  }

  const values = {
    ownerId: input.ownerId,
    name: zernioName(accounts),
    channel: "zernio",
    telegramUsername: accounts.length === 1 ? accounts[0]!.username : null,
    telegramBotId: null,
    externalAccountId: filter,
    tokenEncrypted: encryptSecret(apiKey),
    appSecretEncrypted: null,
    webhookSecret,
    webhookUrl,
    settings,
    status: error ? "error" : "connected",
    lastHealthAt: new Date(),
    lastHealthError: error,
    updatedAt: new Date(),
  };
  if (match) await db.update(bots).set(values).where(eq(bots.id, id));
  else await db.insert(bots).values({ id, ...values });

  await seedBotDefaults(id);
  const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return publicBot(row!);
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
 * Connect a Discord bot. There is no webhook to register: Recatch opens a Gateway connection with the
 * token, so the account starts disconnected and flips to connected once Discord accepts it.
 */
async function connectDiscord(input: ChannelConnectInput) {
  const token = input.token.trim();
  const me = await fetchDiscordBot(token);
  const db = await getDb();
  const existing = await db.select().from(bots);
  const match = existing.find((row) => channelOf(row.channel) === "discord" && row.externalAccountId === me.id);
  assertOwnable(match, input.ownerId);
  const id = match?.id ?? crypto.randomUUID();

  const values = {
    ownerId: input.ownerId,
    name: `${me.global_name ?? me.username} (Discord)`,
    channel: "discord" as const,
    telegramUsername: me.username,
    telegramBotId: null,
    externalAccountId: me.id,
    tokenEncrypted: encryptSecret(token),
    webhookSecret: match?.webhookSecret ?? randomSecret(12),
    webhookUrl: null,
    status: "disconnected",
    lastHealthAt: new Date(),
    lastHealthError: null,
    updatedAt: new Date(),
  };
  if (match) await db.update(bots).set(values).where(eq(bots.id, id));
  else await db.insert(bots).values({ id, ...values });

  await seedBotDefaults(id);
  const { syncDiscordGateways } = await import("@/lib/channels/discord-manager");
  await syncDiscordGateways();
  const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return publicBot(row!);
}

/**
 * Connect a Slack app. The bot token (xoxb-) sends messages; the signing secret verifies that events
 * really come from Slack. Slack pushes to the webhook URL, which the person pastes into the app's
 * Event Subscriptions and Interactivity pages.
 */
async function connectSlack(input: ChannelConnectInput) {
  const token = input.token.trim();
  const signingSecret = (input.appSecret ?? "").trim();
  if (!signingSecret) throw new Error("Slack needs the app's Signing Secret (Basic Information in the Slack app)");
  const me = await fetchSlackIdentity(token);
  const db = await getDb();
  const existing = await db.select().from(bots);
  const match = existing.find((row) => channelOf(row.channel) === "slack" && row.externalAccountId === me.user_id);
  assertOwnable(match, input.ownerId);
  const id = match?.id ?? crypto.randomUUID();
  const originUrl = publicUrl(input.origin);
  const webhookUrl = originUrl ? `${originUrl}/api/slack/webhook/${id}` : null;

  const values = {
    ownerId: input.ownerId,
    name: `${me.user} in ${me.team} (Slack)`,
    channel: "slack" as const,
    telegramUsername: me.user,
    telegramBotId: null,
    externalAccountId: me.user_id,
    tokenEncrypted: encryptSecret(token),
    appSecretEncrypted: encryptSecret(signingSecret),
    webhookSecret: match?.webhookSecret ?? randomSecret(12),
    webhookUrl,
    status: webhookUrl ? "connected" : "disconnected",
    lastHealthAt: new Date(),
    lastHealthError: webhookUrl ? null : "PUBLIC_URL not set. Slack cannot reach this server. Set it and reconnect.",
    updatedAt: new Date(),
  };
  if (match) await db.update(bots).set(values).where(eq(bots.id, id));
  else await db.insert(bots).values({ id, ...values });

  await seedBotDefaults(id);
  const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return publicBot(row!);
}

/**
 * A server that clicked Add to Discord. Recatch's one shared bot is already in it, so there is no token to
 * keep: the account records which server it is, and people reach it by running /chat there.
 */
export async function connectDiscordInstall(input: { ownerId: string; guild: { id: string; name: string } }) {
  const db = await getDb();
  const existing = await db.select().from(bots);
  const match = existing.find((row) => channelOf(row.channel) === "discord" && row.settings?.discordGuildId === input.guild.id);
  assertOwnable(match, input.ownerId);
  const id = match?.id ?? crypto.randomUUID();

  const values = {
    ownerId: input.ownerId,
    name: `${input.guild.name} (Discord)`,
    channel: "discord" as const,
    telegramUsername: null,
    telegramBotId: null,
    externalAccountId: `guild:${input.guild.id}`,
    // Not used: the shared bot's token comes from the environment. The column cannot be empty.
    tokenEncrypted: encryptSecret("shared-discord-bot"),
    appSecretEncrypted: null,
    webhookSecret: match?.webhookSecret ?? randomSecret(12),
    webhookUrl: null,
    settings: { ...(match?.settings ?? {}), discordShared: true, discordGuildId: input.guild.id, discordGuildName: input.guild.name },
    status: "connected",
    lastHealthAt: new Date(),
    lastHealthError: null,
    updatedAt: new Date(),
  };
  if (match) await db.update(bots).set(values).where(eq(bots.id, id));
  else await db.insert(bots).values({ id, ...values });

  await seedBotDefaults(id);
  const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return publicBot(row!);
}

/**
 * A workspace that clicked Add to Slack for the shared Recatch app. The token comes from Slack's OAuth
 * exchange, events arrive at the shared URL and are matched by workspace id, and the signing secret is
 * the company app's own (from the environment), so none is stored per account.
 */
export async function connectSlackInstall(input: { ownerId: string; install: SlackInstall; origin?: string }) {
  const { install } = input;
  const db = await getDb();
  const existing = await db.select().from(bots);
  const match = existing.find((row) => channelOf(row.channel) === "slack" && (row.externalAccountId === install.botUserId || row.settings?.slackTeamId === install.teamId));
  assertOwnable(match, input.ownerId);
  const id = match?.id ?? crypto.randomUUID();

  const values = {
    ownerId: input.ownerId,
    name: `${install.teamName} (Slack)`,
    channel: "slack" as const,
    telegramUsername: null,
    telegramBotId: null,
    externalAccountId: install.botUserId,
    tokenEncrypted: encryptSecret(install.accessToken),
    appSecretEncrypted: null,
    webhookSecret: match?.webhookSecret ?? randomSecret(12),
    webhookUrl: null,
    settings: { ...(match?.settings ?? {}), slackTeamId: install.teamId, slackAppId: install.appId, slackInstalled: true },
    status: "connected",
    lastHealthAt: new Date(),
    lastHealthError: null,
    updatedAt: new Date(),
  };
  if (match) await db.update(bots).set(values).where(eq(bots.id, id));
  else await db.insert(bots).values({ id, ...values });

  await seedBotDefaults(id);
  const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return publicBot(row!);
}

/**
 * Connect a Bluesky account with its handle and an app password (never the main password). There is
 * no webhook: the worker polls the account's chat log. The app password needs the "Allow access to
 * your direct messages" box ticked, which checkBlueskyAccount verifies.
 */
async function connectBluesky(input: ChannelConnectInput) {
  const handle = (input.externalAccountId ?? "").trim().replace(/^@/, "");
  if (!handle) throw new Error("Enter the Bluesky handle, like name.bsky.social");
  const session = await checkBlueskyAccount(handle, input.token);
  const db = await getDb();
  const existing = await db.select().from(bots);
  const match = existing.find((row) => channelOf(row.channel) === "bluesky" && row.externalAccountId === session.did);
  assertOwnable(match, input.ownerId);
  const id = match?.id ?? crypto.randomUUID();
  forgetBlueskySession(id);

  const values = {
    ownerId: input.ownerId,
    name: `@${session.handle} (Bluesky)`,
    channel: "bluesky" as const,
    telegramUsername: session.handle,
    telegramBotId: null,
    externalAccountId: session.did,
    tokenEncrypted: encryptSecret(input.token.trim()),
    webhookSecret: match?.webhookSecret ?? randomSecret(12),
    webhookUrl: null,
    status: "connected",
    lastHealthAt: new Date(),
    lastHealthError: null,
    updatedAt: new Date(),
  };
  if (match) await db.update(bots).set(values).where(eq(bots.id, id));
  else await db.insert(bots).values({ id, ...values });

  await seedBotDefaults(id);
  const [row] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
  return publicBot(row!);
}

/**
 * Connect any channel. Telegram keeps its BotFather flow; Meta channels store the access token,
 * validate it against the Graph API, and hand back the webhook URL + verify token to paste in Meta's dashboard.
 */
export async function connectChannelAccount(input: ChannelConnectInput) {
  if (input.channel === "telegram") return connectBot(input.token, input.ownerId, input.origin);
  if (input.channel === "discord") return connectDiscord(input);
  if (input.channel === "slack") return connectSlack(input);
  if (input.channel === "bluesky") return connectBluesky(input);
  if (input.channel === "zernio") {
    return connectZernio({
      apiKey: input.token,
      ownerId: input.ownerId,
      accountFilter: input.externalAccountId,
      origin: input.origin,
    });
  }
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
  if (channelOf(bot.channel) === "zernio") {
    if (!bot.ownerId) throw new Error("This account has no owner yet; sign in as the workspace owner first");
    const refreshed = await connectZernio({
      apiKey: token,
      ownerId: bot.ownerId,
      accountFilter: bot.externalAccountId,
      origin,
    });
    return { bot: refreshed, webhook: null, me: null };
  }
  if (channelOf(bot.channel) === "discord" && bot.settings?.discordShared === true) {
    let error: string | null = null;
    try {
      const { discordGuildReachable, discordSharedGatewayState } = await import("@/lib/channels/discord-shared");
      await discordGuildReachable(String(bot.settings.discordGuildId));
      if (discordSharedGatewayState() !== "running") error = "Recatch is not holding the shared Discord connection (the worker is off on this server)";
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Discord check failed";
      error = /unknown guild|missing access/i.test(message) ? "Recatch is no longer in this server. Add it to Discord again to reconnect." : message;
    }
    await db
      .update(bots)
      .set({ status: error ? "error" : "connected", lastHealthAt: new Date(), lastHealthError: error, updatedAt: new Date() })
      .where(eq(bots.id, botId));
    const [updated] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    return { bot: publicBot(updated!), webhook: null, me: null };
  }
  if (channelOf(bot.channel) === "discord") {
    let error: string | null = null;
    let name = bot.name;
    try {
      const me = await fetchDiscordBot(token);
      name = `${me.global_name ?? me.username} (Discord)`;
      const { syncDiscordGateways, discordGatewayState } = await import("@/lib/channels/discord-manager");
      await syncDiscordGateways();
      if (discordGatewayState(botId) !== "running") error = "Recatch is not holding a Discord connection for this bot (the worker is off on this server)";
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Token check failed";
    }
    await db
      .update(bots)
      .set({ name, status: error ? "error" : bot.status === "error" ? "disconnected" : bot.status, lastHealthAt: new Date(), lastHealthError: error, updatedAt: new Date() })
      .where(eq(bots.id, botId));
    const [updated] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    return { bot: publicBot(updated!), webhook: null, me: null };
  }
  if (channelOf(bot.channel) === "bluesky") {
    let error: string | null = null;
    let name = bot.name;
    try {
      forgetBlueskySession(bot.id);
      const session = await checkBlueskyAccount(bot.telegramUsername ?? bot.externalAccountId ?? "", token);
      name = `@${session.handle} (Bluesky)`;
    } catch (caught) {
      error = explainBlueskyError(caught);
    }
    await db
      .update(bots)
      .set({ name, status: error ? "error" : "connected", lastHealthAt: new Date(), lastHealthError: error, updatedAt: new Date() })
      .where(eq(bots.id, botId));
    const [updated] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    return { bot: publicBot(updated!), webhook: null, me: null };
  }
  if (channelOf(bot.channel) === "slack") {
    let error: string | null = null;
    let name = bot.name;
    try {
      const me = await fetchSlackIdentity(token);
      name = `${me.user} in ${me.team} (Slack)`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Token check failed";
    }
    await db
      .update(bots)
      .set({ name, status: error ? "error" : "connected", lastHealthAt: new Date(), lastHealthError: error, updatedAt: new Date() })
      .where(eq(bots.id, botId));
    const [updated] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    return { bot: publicBot(updated!), webhook: null, me: null };
  }
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
export async function getOwnedBot(botId: string, ownerId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.ownerId, ownerId)))
    .limit(1);
  return row ? publicBot(row) : null;
}

/** Unscoped lookup for callers that already authorized the bot (API keys, webhooks). */
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
