import { AiUnavailableError, aiConfigured } from "@/lib/ai";
import { budgetExhaustedMessage, readAssistantBudget } from "@/lib/agent/budget";
import { loadAssistantContext } from "@/lib/agent/context";
import { appendAgentMessage, listAgentHistory } from "@/lib/agent/history";
import { workspaceAiProvider } from "@/lib/agent/provider";
import { runWorkspaceAgent } from "@/lib/agent/run";
import { requireUserId } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { allowAttempt } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Each message can run up to six model calls, so cap messages per login per hour. */
const MESSAGES_PER_HOUR = 30;

/**
 * Stream one assistant turn as server-sent events. Tools only read this workspace and save drafts. On
 * the server's Claude key the login's monthly allowance is checked first, and again before every model
 * call inside the turn. Closing the request stops the model call.
 */
export async function POST(request: Request) {
  try {
    const ownerId = await requireUserId();
    const provider = await workspaceAiProvider(ownerId);
    if (!aiConfigured(provider)) {
      return json({ error: "The assistant isn't switched on for this workspace yet. Saving your own AI key (Anthropic, OpenAI, OpenRouter and others) on the AI assistant page turns it on now." }, 503);
    }
    const body = await readJson<{ message?: string; voice?: boolean; page?: string }>(request);
    const message = body.message?.trim().slice(0, 4000) ?? "";
    if (!message) return json({ error: "Message is required" }, 400);
    const voice = body.voice === true;
    if (!provider) {
      const budget = await readAssistantBudget(ownerId);
      if (budget.exhausted) return json({ error: budgetExhaustedMessage(budget), budget }, 429);
    }
    if (!(await allowAttempt(`agent-chat:${ownerId}`, MESSAGES_PER_HOUR, 60 * 60))) {
      return json({ error: `That's ${MESSAGES_PER_HOUR} messages to the assistant this hour, which is the limit. Try again in a bit.` }, 429);
    }
    await appendAgentMessage({ ownerId, role: "user", body: message });
    const [history, context] = await Promise.all([listAgentHistory(ownerId), loadAssistantContext(ownerId, { voice, page: typeof body.page === "string" ? body.page.slice(0, 200) : undefined })]);
    const abort = new AbortController();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let open = true;
        const send = (event: unknown) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            open = false;
          }
        };
        try {
          const result = await runWorkspaceAgent({
            ownerId,
            history: history.slice(0, -1),
            message,
            provider,
            context,
            voice,
            signal: abort.signal,
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
          const text = error instanceof AiUnavailableError ? error.message : "The assistant could not answer that.";
          send({ type: "error", error: text });
        } finally {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the browser going away.
          }
        }
      },
      cancel() {
        abort.abort();
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
