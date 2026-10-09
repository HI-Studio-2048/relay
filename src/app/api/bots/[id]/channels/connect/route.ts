import { logActivity } from "@/lib/activity";
import { ChannelConnectError, startChannelConnect } from "@/lib/channel-connect";
import { isZernioConnectable, zernioPlatformMeta } from "@/lib/channels/zernio";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

/** POST { platform, reconnectAccountId? } → { authUrl }: send the browser there to connect the account. */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ platform?: unknown; reconnectAccountId?: string | null }>(request);
    if (!isZernioConnectable(body.platform)) return json({ error: "Pick a network to connect" }, 400);
    const authUrl = await startChannelConnect({ botId: id, platform: body.platform, origin: request.url, reconnectAccountId: body.reconnectAccountId ?? null });
    await logActivity(request, id, body.reconnectAccountId ? "Started reconnecting" : "Started connecting", zernioPlatformMeta(body.platform).label);
    return json({ authUrl });
  } catch (error) {
    if (error instanceof ChannelConnectError) return json({ error: error.message }, 400);
    return fail(error, "Could not start the connection");
  }
}
