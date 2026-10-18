import { aiConfigured } from "@/lib/ai";
import { listAgentHistory } from "@/lib/agent/history";
import { requireUserId } from "@/lib/auth";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Chat history for the signed-in workspace, and whether the server key is set. */
export async function GET() {
  try {
    const ownerId = await requireUserId();
    const messages = await listAgentHistory(ownerId);
    return json({ configured: aiConfigured(), messages });
  } catch (error) {
    return fail(error);
  }
}
