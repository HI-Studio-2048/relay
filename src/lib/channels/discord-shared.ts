import { eq } from "drizzle-orm";
import { discordEventId, discordRequest, parseDiscordEvent, registerDiscordCommands, respondToDiscordCommand, sendDiscordText, type DiscordGatewayEvent } from "@/lib/channels/discord";
import { DiscordGateway, type GatewayStatus } from "@/lib/channels/discord-gateway";
import { sharedDiscordAppId, sharedDiscordToken } from "@/lib/channels/discord-install";
import { getDb } from "@/lib/db";
import { bots, discordRoutes } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

/**
 * The shared Recatch bot. It sits in every customer's server and Discord gives a DM no server, so people
 * start from the server with /chat. That records which customer's server they came from, and their DMs
 * with the bot go to that customer's flows until they start from another server.
 */
type BotRow = typeof bots.$inferSelect;

const store = globalThis as unknown as { __relayDiscordShared?: DiscordGateway; __relayDiscordHint?: Map<string, number> };
const HINT_EVERY_MS = 60 * 60 * 1000;

export function discordSharedGatewayState() {
  return store.__relayDiscordShared ? "running" : "stopped";
}

export async function botForGuild(guildId: string): Promise<BotRow | null> {
  const db = await getDb();
  const rows = await db.select().from(bots);
  return rows.find((row) => row.channel === "discord" && row.settings?.discordGuildId === guildId) ?? null;
}

export async function setDiscordRoute(discordUserId: string, botId: string) {
  const db = await getDb();
  await db
    .insert(discordRoutes)
    .values({ discordUserId, botId })
    .onConflictDoUpdate({ target: discordRoutes.discordUserId, set: { botId, updatedAt: new Date() } });
}

export async function discordRouteOf(discordUserId: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select().from(discordRoutes).where(eq(discordRoutes.discordUserId, discordUserId)).limit(1);
  return row?.botId ?? null;
}

export type SharedOutcome =
  | { action: "deliver"; botId: string; command: boolean }
  | { action: "command-unknown-server" }
  | { action: "hint"; userId: string }
  | { action: "ignore" };

/** Decide what a Gateway event means for the shared bot, and record the route when someone runs /chat. */
export async function resolveSharedEvent(event: DiscordGatewayEvent): Promise<SharedOutcome> {
  const d = event?.d;
  if (!d) return { action: "ignore" };

  if (event.t === "INTERACTION_CREATE" && d.type === 2) {
    const asker = d.member?.user ?? d.user;
    if (!asker || asker.bot || !d.guild_id || parseDiscordEvent(event).length === 0) return { action: "ignore" };
    const bot = await botForGuild(d.guild_id);
    if (!bot) return { action: "command-unknown-server" };
    await setDiscordRoute(asker.id, bot.id);
    return { action: "deliver", botId: bot.id, command: true };
  }

  // A direct message or a button tapped in one. Neither carries a server, so the route decides.
  if (parseDiscordEvent(event).length === 0) return { action: "ignore" };
  const userId = event.t === "MESSAGE_CREATE" ? d.author?.id : (d.user ?? d.member?.user)?.id;
  if (!userId) return { action: "ignore" };
  const botId = await discordRouteOf(userId);
  if (botId) return { action: "deliver", botId, command: false };
  return event.t === "MESSAGE_CREATE" ? { action: "hint", userId } : { action: "ignore" };
}

export async function handleSharedEvent(event: DiscordGatewayEvent) {
  const outcome = await resolveSharedEvent(event);
  const token = sharedDiscordToken();
  const d = event.d;

  if (outcome.action === "command-unknown-server") {
    if (d.id && d.token) await respondToDiscordCommand(d.id, d.token, "This server hasn't connected Recatch yet. A server admin can add it from the Recatch dashboard.");
    return;
  }
  if (outcome.action === "hint" && token) {
    const sent = (store.__relayDiscordHint ??= new Map<string, number>());
    if (Date.now() - (sent.get(outcome.userId) ?? 0) < HINT_EVERY_MS) return;
    sent.set(outcome.userId, Date.now());
    await sendDiscordText(token, outcome.userId, "To chat with me, type /chat in the server you came from and I'll message you here.");
    return;
  }
  if (outcome.action !== "deliver") return;

  // The command must be answered within three seconds, so do it now rather than from the queue.
  if (outcome.command && d.id && d.token) await respondToDiscordCommand(d.id, d.token, "I've sent you a direct message.");
  await enqueueWebhook({ kind: "webhook", botId: outcome.botId, update: event, eventId: discordEventId(event) });
  if (shouldRunWorker()) void drainJobs(5);
}

async function recordSharedStatus(status: GatewayStatus, error?: string | null) {
  if (status === "connecting") return;
  try {
    const db = await getDb();
    const rows = (await db.select().from(bots)).filter((row) => row.channel === "discord" && row.settings?.discordShared === true);
    for (const row of rows) {
      await db
        .update(bots)
        .set({ status: status === "connected" ? "connected" : "error", lastHealthAt: new Date(), lastHealthError: status === "connected" ? null : (error ?? "Disconnected"), updatedAt: new Date() })
        .where(eq(bots.id, row.id));
    }
  } catch (caught) {
    log.warn("Could not record shared Discord status", caught instanceof Error ? caught.message : caught);
  }
}

/** Open the one shared connection and publish the /chat command. Does nothing until the three Discord secrets are set. */
export function startSharedDiscordGateway() {
  const token = sharedDiscordToken();
  const appId = sharedDiscordAppId();
  if (!token || !appId || store.__relayDiscordShared) return;
  void registerDiscordCommands(token, appId).catch((error) => log.warn("Could not register the /chat command", error instanceof Error ? error.message : error));
  const gateway = new DiscordGateway({
    token,
    onStatus: (status, error) => void recordSharedStatus(status, error),
    onEvent: (event) => void handleSharedEvent(event).catch((error) => log.error("Shared Discord event failed", error instanceof Error ? error.message : error)),
  });
  store.__relayDiscordShared = gateway;
  void gateway.start().catch((error) => log.error("Shared Discord gateway failed to start", error instanceof Error ? error.message : error));
}

/** Whether the bot can still see this server. Used by the health check, since a kick sends us nothing. */
export async function discordGuildReachable(guildId: string) {
  const token = sharedDiscordToken();
  if (!token) throw new Error("Discord is not set up on this server");
  await discordRequest(token, "GET", `/guilds/${guildId}`);
}
