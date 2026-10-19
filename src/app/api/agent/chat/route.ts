import { AiUnavailableError, aiConfigured } from "@/lib/ai";
import { appendAgentMessage, listAgentHistory } from "@/lib/agent/history";
import { workspaceAiProvider } from "@/lib/agent/provider";
import { runWorkspaceAgent } from "@/lib/agent/run";
import { requireUserId } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { allowAttempt } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Each message can run up to six model calls, so cap messages per login per hour. */
const MESSAGES_PER_HOUR = 30;

/** Stream one growth-agent turn. Tools only read this workspace and save drafts. */
export async function POST(request: Request) {
  try {
    const ownerId = await requireUserId();
    const provider = await workspaceAiProvider(ownerId);
    if (!aiConfigured(provider)) {
      return json({ error: "The growth agent is not set up. Save an OpenRouter key on the AI assistant page first." }, 503);
    }
    const body = await readJson<{ message?: string }>(request);
    const message = body.message?.trim().slice(0, 4000) ?? "";
    if (!message) return json({ error: "Message is required" }, 400);
    if (!(await allowAttempt(`agent-chat:${ownerId}`, MESSAGES_PER_HOUR, 60 * 60))) {
      return json({ error: `That's ${MESSAGES_PER_HOUR} messages to the growth agent this hour, which is the limit. Try again in a bit.` }, 429);
    }
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
            provider,
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
