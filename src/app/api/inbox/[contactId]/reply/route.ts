import { AgentReplyError, sendAgentReply } from "@/lib/agent-reply";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { agentIdFromCookieHeader, findMember } from "@/lib/team";

export async function POST(request: Request, context: RouteParams<{ contactId: string }>) {
  try {
    const { contactId } = await context.params;
    const body = await readJson<{ text?: string }>(request);
    if (!body.text?.trim()) return json({ error: "Message text is required" }, 400);
    const agent = await findMember(agentIdFromCookieHeader(request.headers.get("cookie")));
    const sent = await sendAgentReply({ contactId, text: body.text, agent: agent ? { id: agent.id, name: agent.name } : null });
    return json({ ok: true, telegramMessageId: sent.message_id });
  } catch (error) {
    if (error instanceof AgentReplyError) return json({ error: error.message }, 404);
    return fail(error, "Could not send reply");
  }
}
