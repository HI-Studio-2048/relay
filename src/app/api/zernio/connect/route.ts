import { requireUserId } from "@/lib/auth";
import { isZernioConnectable, zernioPlatformMeta } from "@/lib/channels/zernio";
import { fail, json, readJson } from "@/lib/http";
import { ChannelConnectError, startZernioConnect } from "@/lib/zernio-connect";

/** POST { platform, reconnectAccountId? } returns { authUrl }: send the browser there to connect the account. */
export async function POST(request: Request) {
  try {
    const ownerId = await requireUserId();
    const body = await readJson<{ platform?: unknown; reconnectAccountId?: string | null }>(request);
    if (!isZernioConnectable(body.platform)) return json({ error: "Pick Instagram, Messenger or WhatsApp" }, 400);
    const authUrl = await startZernioConnect({ ownerId, platform: body.platform, origin: request.url, reconnectAccountId: body.reconnectAccountId ?? null });
    return json({ authUrl, label: zernioPlatformMeta(body.platform).label });
  } catch (error) {
    if (error instanceof ChannelConnectError) return json({ error: error.message }, 400);
    return fail(error, "Could not start the connection");
  }
}
