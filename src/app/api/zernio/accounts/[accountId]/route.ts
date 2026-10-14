import { requireUserId } from "@/lib/auth";
import { disconnectZernioFor } from "@/lib/bots";
import { zernioPlatformMeta } from "@/lib/channels/zernio";
import { fail, json, readJson, type RouteParams } from "@/lib/http";

/** DELETE { confirm: true } disconnects one Meta account (DMs from it stop arriving). */
export async function DELETE(request: Request, context: RouteParams<{ accountId: string }>) {
  try {
    const ownerId = await requireUserId();
    const { accountId } = await context.params;
    const body = await readJson<{ confirm?: unknown }>(request).catch(() => ({ confirm: undefined }));
    if (body.confirm !== true) return json({ error: "Disconnecting requires confirm: true", code: "CONFIRM_REQUIRED" }, 409);
    const removed = await disconnectZernioFor(ownerId, accountId, request.url);
    return json({ ok: true, label: zernioPlatformMeta(removed.platform).label });
  } catch (error) {
    return fail(error, "Could not disconnect");
  }
}
