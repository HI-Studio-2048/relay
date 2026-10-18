import { requireUserId } from "@/lib/auth";
import { getOwnedBot } from "@/lib/bots";
import { ALL_CHANNELS, BOT_COOKIE, FOCUS_COOKIE } from "@/lib/current-bot";
import { json, fail, readJson } from "@/lib/http";

function cookie(name: string, value: string) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** Remember which connected account the console shows. `all` is every channel in the workspace. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string }>(request);
    if (!body.botId) return json({ error: "botId is required" }, 400);
    if (body.botId === ALL_CHANNELS) {
      await requireUserId();
      const response = json({ ok: true });
      response.headers.append("set-cookie", cookie(BOT_COOKIE, ALL_CHANNELS));
      return response;
    }
    const bot = await getOwnedBot(body.botId, await requireUserId());
    if (!bot) return json({ error: "Account not found" }, 404);
    const response = json({ ok: true });
    response.headers.append("set-cookie", cookie(BOT_COOKIE, body.botId));
    response.headers.append("set-cookie", cookie(FOCUS_COOKIE, body.botId));
    return response;
  } catch (error) {
    return fail(error);
  }
}
