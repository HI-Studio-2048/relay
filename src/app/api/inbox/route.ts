import { requireBotAccess, requireUserId } from "@/lib/auth";
import { json, fail } from "@/lib/http";
import { ALL_CHANNELS } from "@/lib/scope";
import { listInboxThreads, listWorkspaceInbox } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    if (scope === ALL_CHANNELS) {
      const userId = await requireUserId();
      return json({ threads: await listWorkspaceInbox(userId) });
    }
    const botId = url.searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    return json({ threads: await listInboxThreads(botId) });
  } catch (error) {
    return fail(error);
  }
}
