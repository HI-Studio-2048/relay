import { requireBotAccess, requireUserId } from "@/lib/auth";
import { listBots } from "@/lib/bots";
import { json, fail } from "@/lib/http";
import { listInboxThreads } from "@/lib/store";

/** Live Chat list for one account, or `botId=all` for every account the signed-in user owns. */
export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    if (botId !== "all") {
      await requireBotAccess(botId);
      return json({ threads: await listInboxThreads(botId) });
    }
    const bots = await listBots(await requireUserId());
    const perBot = await Promise.all(bots.map((bot) => listInboxThreads(bot.id)));
    const threads = perBot.flat().sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
    return json({ threads });
  } catch (error) {
    return fail(error);
  }
}
