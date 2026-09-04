import { connectBot, listBots } from "@/lib/bots";
import { json, fail, readJson } from "@/lib/http";

export async function GET() {
  try {
    return json({ bots: await listBots() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ token?: string }>(request);
    if (!body.token?.trim()) return json({ error: "Paste a bot token from @BotFather" }, 400);
    const bot = await connectBot(body.token, request.url);
    return json({ bot });
  } catch (error) {
    return fail(error, "Could not connect bot");
  }
}
