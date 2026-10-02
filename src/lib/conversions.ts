import { eq } from "drizzle-orm";
import { lastTouchFlow } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { flowEvents, flows, processedEvents } from "@/lib/db/schema";
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
  /** A provider event id (e.g. Stripe's): claimed in the same transaction as the goal, so a retry is a no-op. */
  claim?: { source: string; eventId: string };
}): Promise<{ flowId: string | null; duplicate: boolean }> {
  const db = await getDb();
  let flowId: string | null = input.flowId ?? (await lastTouchFlow(input.contactId));
  if (flowId) {
    const [flow] = await db.select({ botId: flows.botId }).from(flows).where(eq(flows.id, flowId)).limit(1);
    if (!flow || flow.botId !== input.botId) flowId = null;
  }
  // Recorded even with no flow to credit, so the revenue still counts toward the account's totals.
  // Written directly (not best-effort) so a failed write surfaces and the caller can retry.
  const stored = await db.transaction(async (tx) => {
    if (input.claim) {
      const fresh = await tx
        .insert(processedEvents)
        .values({ botId: input.botId, source: input.claim.source, eventId: input.claim.eventId })
        .onConflictDoNothing()
        .returning();
      if (fresh.length === 0) return false;
    }
    await tx.insert(flowEvents).values({
      id: crypto.randomUUID(),
      botId: input.botId,
      flowId,
      contactId: input.contactId,
      kind: "goal",
      name: input.name,
      value: input.value,
      currency: input.currency ?? null,
    });
    return true;
  });
  if (!stored) return { flowId, duplicate: true };
  // The goal is committed: nothing after this may fail the call (a webhook caller would retry and double count).
  try {
    const contact = await loadContactRecord(input.contactId);
    if (contact) {
      await runRules(input.botId, contact, [{ type: "goal_reached", value: input.name }]);
      emitWebhookSoon(input.botId, "goal.reached", { contact: publicContact(contact), goal: { name: input.name, value: input.value, flowId } });
    }
  } catch (error) {
    log.warn("Goal follow-ups failed", error instanceof Error ? error.message : error);
  }
  return { flowId, duplicate: false };
}
