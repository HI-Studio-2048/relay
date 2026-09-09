import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots, flows } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { setMyCommands, type BotCommand } from "@/lib/telegram";

const COMMAND_RE = /^[a-z0-9_]{1,32}$/;

/**
 * ManyChat keeps Telegram's "/" menu in sync with the bot's command triggers.
 * Every active flow with a Command trigger becomes a menu entry described by the flow name.
 */
export function commandsFromFlows(
  rows: { triggerType: string; triggerValue: string | null; isActive: boolean; name: string }[],
): BotCommand[] {
  const seen = new Set<string>();
  const commands: BotCommand[] = [];
  for (const row of rows) {
    if (!row.isActive || row.triggerType !== "command") continue;
    const command = (row.triggerValue ?? "").trim().replace(/^\//, "").toLowerCase();
    if (!COMMAND_RE.test(command) || seen.has(command)) continue;
    seen.add(command);
    const description = row.name.trim().slice(0, 256) || command;
    commands.push({ command, description: description.length < 3 ? `${description} flow` : description });
    if (commands.length >= 100) break;
  }
  return commands;
}

/** Push the current command menu to Telegram. Never throws: a menu is nice-to-have, saving a flow is not. */
export async function syncBotCommands(botId: string): Promise<BotCommand[]> {
  try {
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    if (!bot || (bot.channel ?? "telegram") !== "telegram") return [];
    const rows = await db.select().from(flows).where(eq(flows.botId, botId));
    const commands = commandsFromFlows(rows);
    await setMyCommands(decryptSecret(bot.tokenEncrypted), commands);
    return commands;
  } catch (error) {
    log.warn("setMyCommands failed", error instanceof Error ? error.message : error);
    return [];
  }
}
