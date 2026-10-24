import { aiConfigured } from "@/lib/ai";
import { readAssistantBudget } from "@/lib/agent/budget";
import { assistantSuggestions, ownerFirstName } from "@/lib/agent/context";
import { clearAgentHistory, listAgentHistory } from "@/lib/agent/history";
import { workspaceAiProvider } from "@/lib/agent/provider";
import { requireUserId } from "@/lib/auth";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * The signed-in login's assistant: chat history, whether it has a key to run on (its own OpenRouter key
 * or the server's), and on the server's key how much of this month's allowance is left.
 */
export async function GET() {
  try {
    const ownerId = await requireUserId();
    const [messages, provider, suggestions, firstName] = await Promise.all([
      listAgentHistory(ownerId),
      workspaceAiProvider(ownerId),
      assistantSuggestions(ownerId),
      ownerFirstName(ownerId),
    ]);
    const configured = aiConfigured(provider);
    const budget = configured && !provider ? await readAssistantBudget(ownerId) : null;
    return json({ configured, billing: provider ? "openrouter" : "server", budget, suggestions, firstName, messages });
  } catch (error) {
    return fail(error);
  }
}

/** New chat: forget the conversation. Drafts the assistant saved are kept. */
export async function DELETE() {
  try {
    const ownerId = await requireUserId();
    await clearAgentHistory(ownerId);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
