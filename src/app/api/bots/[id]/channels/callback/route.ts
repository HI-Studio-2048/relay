import { logActivity } from "@/lib/activity";
import { finishChannelConnect } from "@/lib/channel-connect";
import { log } from "@/lib/logger";
import { type RouteParams } from "@/lib/http";

/** Zernio sends the browser here after the platform's consent screen; we sync and return to Channels. */
export async function GET(request: Request, context: RouteParams<{ id: string }>) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const back = new URL("/channels", url.origin);
  try {
    const result = await finishChannelConnect({ botId: id, params: url.searchParams, origin: request.url });
    back.searchParams.set(result.ok ? "connected" : "error", result.message);
    if (result.ok) await logActivity(request, id, "Connected", result.message.split(" is connected")[0]);
  } catch (error) {
    log.warn("Channel connect callback failed", error instanceof Error ? error.message : error);
    back.searchParams.set("error", "The account was connected in Zernio, but Relay could not sync it. Press Refresh on the Channels page.");
  }
  return Response.redirect(back.toString(), 303);
}
