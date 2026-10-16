import { AgentReplyError, sendAgentReply } from "@/lib/agent-reply";
import { requireBotAccess } from "@/lib/auth";
import { requireRowAccess } from "@/lib/auth/resources";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { parseStoredMediaUrl, readMediaFile, toFlowMedia } from "@/lib/media";
import { agentIdFromCookieHeader, findMember } from "@/lib/team";

export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const userId = await requireBotAccess(await requireRowAccess("contact", contactId));
    const body = await readJson<{ text?: string; media?: { url?: string } | null }>(request);
    // Only files uploaded to Recatch, rebuilt from what was stored rather than what the browser says.
    const stored = body.media?.url ? parseStoredMediaUrl(body.media.url) : null;
    if (body.media && stored?.type !== "local") return json({ error: "Attach a file uploaded to Recatch" }, 400);
    const media = stored?.type === "local" ? toFlowMedia((await readMediaFile(stored.id)).record) : null;
    if (!body.text?.trim() && !media) return json({ error: "Message text is required" }, 400);
    const agent = await findMember(agentIdFromCookieHeader(request.headers.get("cookie")), userId);
    const sent = await sendAgentReply({ contactId, text: body.text ?? "", media, agent: agent ? { id: agent.id, name: agent.name } : null });
    return json({ ok: true, telegramMessageId: sent.message_id });
  } catch (error) {
    if (error instanceof AgentReplyError) return json({ error: error.message }, 404);
    return fail(error, "Could not send reply");
  }
}
