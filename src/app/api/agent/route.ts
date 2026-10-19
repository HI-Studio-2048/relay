import { aiConfigured } from "@/lib/ai";
import { listAgentHistory } from "@/lib/agent/history";
import { workspaceAiProvider } from "@/lib/agent/provider";
import { requireUserId } from "@/lib/auth";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Chat history for the signed-in workspace, and whether it has a key to run on (its own OpenRouter key or the server's). */
export async function GET() {
  try {
    const ownerId = await requireUserId();
    const [messages, provider] = await Promise.all([listAgentHistory(ownerId), workspaceAiProvider(ownerId)]);
    return json({ configured: aiConfigured(provider), messages });
  } catch (error) {
    return fail(error);
  }
}
