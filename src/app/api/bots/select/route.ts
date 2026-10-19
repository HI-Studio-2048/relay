import { requireUserId } from "@/lib/auth";
import { getOwnedBot } from "@/lib/bots";
import { ALL_CHANNELS, FOCUS_COOKIE, VIEW_COOKIE, consoleScope } from "@/lib/current-bot";
import { json, fail, readJson } from "@/lib/http";
import { applySelection } from "@/lib/scope";

function cookie(name: string, value: string) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * Remember a pick in the channel switcher. `keepView` comes from single-account pages:
 * it moves the account they edit without narrowing Overview and Live Chat.
 * The old `relay.botId` cookie is left alone.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; keepView?: boolean }>(request);
    if (!body.botId) return json({ error: "botId is required" }, 400);
    const userId = await requireUserId();
    if (body.botId !== ALL_CHANNELS && !(await getOwnedBot(body.botId, userId))) {
      return json({ error: "Account not found" }, 404);
    }
    const next = applySelection(await consoleScope(), body.botId, body.keepView === true);
    const response = json({ ok: true, aggregate: next.aggregate });
    if (next.view) response.headers.append("set-cookie", cookie(VIEW_COOKIE, next.view));
    if (next.focus) response.headers.append("set-cookie", cookie(FOCUS_COOKIE, next.focus));
    return response;
  } catch (error) {
    return fail(error);
  }
}
