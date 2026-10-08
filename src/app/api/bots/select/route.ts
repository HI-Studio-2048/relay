import { requireUserId } from "@/lib/auth";
import { getOwnedBot } from "@/lib/bots";
import { BOT_COOKIE } from "@/lib/current-bot";
import { json, fail, readJson } from "@/lib/http";

/** Remember which connected account the console shows. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string }>(request);
    if (!body.botId) return json({ error: "botId is required" }, 400);
    const bot = await getOwnedBot(body.botId, await requireUserId());
    if (!bot) return json({ error: "Account not found" }, 404);
    const response = json({ ok: true });
    response.headers.append(
      "set-cookie",
      `${BOT_COOKIE}=${encodeURIComponent(body.botId)}; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
    return response;
  } catch (error) {
    return fail(error);
  }
}
