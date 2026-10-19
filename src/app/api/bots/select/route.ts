import { requireUserId } from "@/lib/auth";
import { getOwnedBot } from "@/lib/bots";
import { ALL_CHANNELS, FOCUS_COOKIE, VIEW_COOKIE } from "@/lib/current-bot";
import { json, fail, readJson } from "@/lib/http";

function cookie(name: string, value: string) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** Remember an explicit channel choice. The old `relay.botId` cookie is left alone. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string }>(request);
    if (!body.botId) return json({ error: "botId is required" }, 400);
    if (body.botId === ALL_CHANNELS) {
      await requireUserId();
      const response = json({ ok: true });
      response.headers.append("set-cookie", cookie(VIEW_COOKIE, ALL_CHANNELS));
      return response;
    }
    const bot = await getOwnedBot(body.botId, await requireUserId());
    if (!bot) return json({ error: "Account not found" }, 404);
    const response = json({ ok: true });
    response.headers.append("set-cookie", cookie(VIEW_COOKIE, body.botId));
    response.headers.append("set-cookie", cookie(FOCUS_COOKIE, body.botId));
    return response;
  } catch (error) {
    return fail(error);
  }
}
