import { eq } from "drizzle-orm";
import { lastTouchFlow } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { flowEvents, flows } from "@/lib/db/schema";
import { emitWebhookSoon, publicContact } from "@/lib/developer";
import { log } from "@/lib/logger";
import { runRules } from "@/lib/rules";
import { loadContactRecord } from "@/lib/store";

/**
 * Record a purchase / booking for a contact: credited to `flowId` (if it belongs to this account) or
 * to the last flow they started in the past 7 days (else no flow); runs goal rules and the goal.reached webhook.
 */
export async function recordConversion(input: {
  botId: string;
  contactId: string;
  name: string;
  value: number | null;
  currency?: string | null;
  flowId?: string | null;
}) {
  let flowId: string | null = input.flowId ?? (await lastTouchFlow(input.contactId));
  if (flowId) {
    const db = await getDb();
    const [flow] = await db.select({ botId: flows.botId }).from(flows).where(eq(flows.id, flowId)).limit(1);
    if (!flow || flow.botId !== input.botId) flowId = null;
  }
  // Recorded even with no flow to credit, so the revenue still counts toward the account's totals.
  // Written directly (not best-effort) so a failed write surfaces and the caller can retry.
  const db = await getDb();
  await db.insert(flowEvents).values({
    id: crypto.randomUUID(),
    botId: input.botId,
    flowId,
    contactId: input.contactId,
    kind: "goal",
    name: input.name,
    value: input.value,
    currency: input.currency ?? null,
  });
  const contact = await loadContactRecord(input.contactId);
  if (contact) {
    // The goal is stored; a failing rule must not undo it (or make a webhook caller retry and double count).
    await runRules(input.botId, contact, [{ type: "goal_reached", value: input.name }]).catch((error) =>
      log.warn("Goal rules failed", error instanceof Error ? error.message : error),
    );
    emitWebhookSoon(input.botId, "goal.reached", { contact: publicContact(contact), goal: { name: input.name, value: input.value, flowId } });
  }
  return flowId;
}
