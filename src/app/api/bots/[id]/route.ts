import { requireBotAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { assertConfirm } from "@/lib/broadcast";
import { getBot, releaseZernioBot } from "@/lib/bots";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { revokeBlueskySession } from "@/lib/channels/bluesky-oauth";
import { leaveDiscordGuild } from "@/lib/channels/discord-install";
import { revokeSlackToken } from "@/lib/channels/slack-install";
import { deleteWebhook } from "@/lib/telegram";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const bot = await getBot(id);
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
    // An account that came from Add to Slack gives the app back to the workspace; one made by hand keeps its token.
    if (row.channel === "slack" && row.settings?.slackInstalled === true) await revokeSlackToken(decryptSecret(row.tokenEncrypted));
    // A Bluesky account that signed in with OAuth signs out at Bluesky too.
    if (row.channel === "bluesky" && row.settings?.blueskyOauth === true) await revokeBlueskySession(String(row.externalAccountId));
    // A Meta account stops billing at Zernio when it goes: its accounts are disconnected and its profile dropped.
    let zernioWarning: string | null = null;
    if (row.channel === "zernio") {
      try {
        await releaseZernioBot(row);
      } catch (error) {
        zernioWarning = `The account was removed, but Zernio did not release its connected accounts (${error instanceof Error ? error.message : "error"}). Disconnect them in the Zernio dashboard so they stop being billed.`;
      }
    }
    const left = row.channel === "discord" && row.settings?.discordShared === true ? await leaveDiscordGuild(String(row.settings.discordGuildId)) : null;
    await db.delete(bots).where(eq(bots.id, id));
    if (row.channel === "discord") {
      const { syncDiscordGateways } = await import("@/lib/channels/discord-manager");
      await syncDiscordGateways();
    }
    // The account is gone either way; if the bot could not leave the server, say so and why.
    return json({ ok: true, ...(zernioWarning ? { warning: zernioWarning } : {}), ...(left && !left.left ? { warning: `The account was removed, but the bot could not leave the Discord server (${left.reason}). Remove the Recatch bot from the server in Discord.` } : {}) });
  } catch (error) {
    return fail(error);
  }
}
