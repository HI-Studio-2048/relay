import { AiUnavailableError, aiConfigured } from "@/lib/ai";
import { appendAgentMessage, listAgentHistory } from "@/lib/agent/history";
import { runWorkspaceAgent } from "@/lib/agent/run";
import { requireUserId } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Stream one growth-agent turn. Tools only read this workspace and save drafts. */
export async function POST(request: Request) {
  try {
    const ownerId = await requireUserId();
    if (!aiConfigured()) {
      return json({ error: "The growth agent is not configured. Set ANTHROPIC_API_KEY on the server." }, 503);
    }
    const body = await readJson<{ message?: string }>(request);
    const message = body.message?.trim().slice(0, 4000) ?? "";
    if (!message) return json({ error: "Message is required" }, 400);
    await appendAgentMessage({ ownerId, role: "user", body: message });
    const history = await listAgentHistory(ownerId);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        try {
          const result = await runWorkspaceAgent({
            ownerId,
            history: history.slice(0, -1),
            message,
            onEvent: send,
          });
          await appendAgentMessage({
            ownerId,
            role: "assistant",
            body: result.reply,
            meta: { drafts: result.drafts },
          });
          send({ type: "done" });
        } catch (error) {
          const text = error instanceof AiUnavailableError ? error.message : "The agent could not answer that.";
          send({ type: "error", error: text });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
