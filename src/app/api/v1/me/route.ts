import { apiHandler } from "@/lib/api-v1";
import { getBot } from "@/lib/bots";
import { json } from "@/lib/http";

export async function GET(request: Request) {
  return apiHandler(request, async (botId) => {
    const bot = await getBot(botId);
    return json({ account: bot ? { id: bot.id, name: bot.name, channel: bot.channel, status: bot.status } : null });
  });
}
