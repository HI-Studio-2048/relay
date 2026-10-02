import { eq } from "drizzle-orm";
import { lastTouchFlow, recordFlowEvents } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { emitWebhookSoon, publicContact } from "@/lib/developer";
import { runRules } from "@/lib/rules";
import { loadContactRecord } from "@/lib/store";

/**
 * Record a purchase / booking for a contact: credited to `flowId` (if it belongs to this account) or
 * to the last flow they started in the past 7 days; runs goal rules and the goal.reached webhook.
 */
export async function recordConversion(input: { botId: string; contactId: string; name: string; value: number | null; flowId?: string | null }) {
  let flowId: string | null = input.flowId ?? (await lastTouchFlow(input.contactId));
  if (flowId) {
    const db = await getDb();
    const [flow] = await db.select({ botId: flows.botId }).from(flows).where(eq(flows.id, flowId)).limit(1);
    if (!flow || flow.botId !== input.botId) flowId = null;
  }
  if (flowId) await recordFlowEvents([{ botId: input.botId, flowId, contactId: input.contactId, kind: "goal", name: input.name, value: input.value }]);
  const contact = await loadContactRecord(input.contactId);
  if (contact) {
    await runRules(input.botId, contact, [{ type: "goal_reached", value: input.name }]);
    emitWebhookSoon(input.botId, "goal.reached", { contact: publicContact(contact), goal: { name: input.name, value: input.value, flowId } });
  }
  return flowId;
}
