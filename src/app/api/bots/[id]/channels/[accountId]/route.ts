import { logActivity } from "@/lib/activity";
import { ChannelConnectError, disconnectChannel } from "@/lib/channel-connect";
import { zernioPlatformMeta } from "@/lib/channels/zernio";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

/** DELETE { confirm: true } — disconnect one social account (DMs from it stop arriving). */
export async function DELETE(request: Request, context: RouteParams<{ id: string; accountId: string }>) {
  try {
    const { id, accountId } = await context.params;
    const body = await readJson<{ confirm?: unknown }>(request).catch(() => ({ confirm: undefined }));
    if (body.confirm !== true) return json({ error: "Disconnecting requires confirm: true", code: "CONFIRM_REQUIRED" }, 409);
    const removed = await disconnectChannel({ botId: id, accountId, origin: request.url });
    await logActivity(request, id, "Disconnected", `${zernioPlatformMeta(removed.platform).label}${removed.username ? ` @${removed.username}` : ""}`);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof ChannelConnectError) return json({ error: error.message }, 400);
    return fail(error, "Could not disconnect");
  }
}
