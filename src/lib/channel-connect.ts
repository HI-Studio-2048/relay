import { eq } from "drizzle-orm";
import { healthCheckBot, publicBot } from "@/lib/bots";
import { disconnectZernioAccount, resolveZernioProfile, zernioConnectUrl, zernioPlatformMeta, type ZernioConnectable } from "@/lib/channels/zernio";
import { channelOf } from "@/lib/channels/types";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { publicUrl } from "@/lib/env";

export class ChannelConnectError extends Error {}

async function loadZernioBot(botId: string) {
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot) throw new ChannelConnectError("Account not found");
  if (channelOf(bot.channel) !== "zernio") throw new ChannelConnectError("Connect a Zernio workspace first: social accounts are added through it.");
  return { db, bot, apiKey: decryptSecret(bot.tokenEncrypted) };
}

/** Where Zernio sends people back after the platform's consent screen. */
export function connectCallbackUrl(botId: string, origin: string) {
  return `${publicUrl(origin) ?? new URL(origin).origin}/api/bots/${botId}/channels/callback`;
}

/**
 * Start connecting a social network: returns the consent-screen URL to send the browser to.
 * `reconnectAccountId` refreshes an account Zernio lost access to, keeping its history.
 */
export async function startChannelConnect(input: { botId: string; platform: ZernioConnectable; origin: string; reconnectAccountId?: string | null }) {
  const { db, bot, apiKey } = await loadZernioBot(input.botId);
  if (input.reconnectAccountId) {
    const linked = publicBot(bot).linkedAccounts.find((account) => account.id === input.reconnectAccountId);
    if (!linked || linked.platform !== input.platform) throw new ChannelConnectError("That account isn't connected here");
  }
  const saved = (bot.settings?.zernioProfileId as string | undefined) ?? null;
  const profileId = await resolveZernioProfile(apiKey, saved);
  if (profileId !== saved) {
    await db.update(bots).set({ settings: { ...(bot.settings ?? {}), zernioProfileId: profileId } }).where(eq(bots.id, bot.id));
  }
  return zernioConnectUrl(apiKey, {
    platform: input.platform,
    profileId,
    redirectUrl: connectCallbackUrl(bot.id, input.origin),
    reconnectAccountId: input.reconnectAccountId ?? null,
  });
}

/**
 * Zernio redirected back. On success the new account is synced into Recatch (and added to the account
 * filter when this Recatch account only routes some of the workspace's accounts) and the webhook re-registered.
 */
export async function finishChannelConnect(input: { botId: string; params: URLSearchParams; origin: string }) {
  const { params } = input;
  const platform = params.get("connected") ?? params.get("platform") ?? "";
  const label = zernioPlatformMeta(platform).label;
  if (params.get("error")) {
    const reason = params.get("error_message") || params.get("error")!.replace(/_/g, " ");
    return { ok: false as const, platform, message: `${label} wasn't connected: ${reason}` };
  }
  const accountId = params.get("accountId");
  if (!params.get("connected") || !accountId) return { ok: false as const, platform, message: `${label} wasn't connected. Try again.` };
  const { db, bot } = await loadZernioBot(input.botId);
  const filter = (bot.externalAccountId ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (filter.length && !filter.includes(accountId)) {
    await db.update(bots).set({ externalAccountId: [...filter, accountId].join(",") }).where(eq(bots.id, bot.id));
  }
  await healthCheckBot(bot.id, input.origin);
  const username = params.get("username");
  return { ok: true as const, platform, message: `${label}${username ? ` @${username.replace(/^@/, "")}` : ""} is connected. New DMs and comments will show up in Live Chat.` };
}

/** Disconnect one social account from the workspace and resync. */
export async function disconnectChannel(input: { botId: string; accountId: string; origin: string }) {
  const { db, bot, apiKey } = await loadZernioBot(input.botId);
  const linked = publicBot(bot).linkedAccounts.find((account) => account.id === input.accountId);
  if (!linked) throw new ChannelConnectError("That account isn't connected here");
  await disconnectZernioAccount(apiKey, input.accountId);
  const filter = (bot.externalAccountId ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (filter.includes(input.accountId)) {
    const rest = filter.filter((id) => id !== input.accountId);
    // Never widen a filtered account to "everything" by removing its last id.
    await db.update(bots).set({ externalAccountId: rest.length ? rest.join(",") : "__none__" }).where(eq(bots.id, bot.id));
  }
  await healthCheckBot(bot.id, input.origin).catch(() => undefined);
  return linked;
}
