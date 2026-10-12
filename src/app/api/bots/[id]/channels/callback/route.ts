import { logActivity } from "@/lib/activity";
import { finishChannelConnect } from "@/lib/channel-connect";
import { log } from "@/lib/logger";
import { redirectTo, type RouteParams } from "@/lib/http";

/** Zernio sends the browser here after the platform's consent screen; we sync and return to Channels. */
export async function GET(request: Request, context: RouteParams<{ id: string }>) {
  const { id } = await context.params;
  const url = new URL(request.url);
  let key = "error";
  let message = "";
  try {
    const result = await finishChannelConnect({ botId: id, params: url.searchParams, origin: request.url });
    key = result.ok ? "connected" : "error";
    message = result.message;
    if (result.ok) await logActivity(request, id, "Connected", result.message.split(" is connected")[0]);
  } catch (error) {
    log.warn("Channel connect callback failed", error instanceof Error ? error.message : error);
    key = "error";
    message = "The account was connected in Zernio, but Recatch could not sync it. Press Refresh on the Channels page.";
  }
  return redirectTo("/channels", key, message);
}
